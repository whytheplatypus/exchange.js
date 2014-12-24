
/**
* The Exchange class, creates and manages peer exchange logic.
* @constructor
* @param  {String} id The id used to identify the local machiene
*
* @todo keep track of jumps and time out a request after some number
* @todo identify all requests with a md5 hash
* @todo custom error objects
* @todo fix it so already broken up chunks get forwarded
* @todo make it so we only start sending ice candidtates after we get an answer?
* @todo verify that a packet has all the correct attributes set. (to, from, path).
*/
var Exchange = function(id){
	var self = this;
	this.id = id;

	/**
	* {peer: Exchange.Manager} pairs
	* @type {Object}
	*/
	this.managers = {};

	this.events = {
		'peer': new Array(),
		'peers': new Array(),
		'pre:data': new Array()
	}

	/**
	* Array of connected websocket servers their protocols eg. [{socket: ws,
	*   protocol:{
	* 		to: 'to',
	*      from: 'from',
	*      type: 'type',
	*      payload: 'payload',
	*      ignore: 'OPEN',
	*      offer: 'OFFER',
	*      answer: 'ANSWER',
	*      candidate: 'CANDIDATE',
	*      port: 'PORT'
	*   }
	* }]
	* @type {Array}
	*/
	this.servers = [];
}

/**
* Add a websocket server to the list of servers.
* @todo  test open.
* @todo  data specific protocol names
* @todo  let ignore be an array
* @param  {String} server       A websocket server address.
* @param  {Object}    protocol The translation from our protocol to theirs.
*/
Exchange.prototype.initServer = function(server, protocol) {
	var self = this;
	var ws = new WebSocket(server);
	ws.onmessage = function(e){
		var initialData = JSON.parse(e.data);
		try{
			self.trigger('pre:data', initialData);
		} catch (e){
			self.trigger('error:data', e, data);
			return;
		}
		//translate from server speak to exchange speak
		var data = {
			to: initialData[protocol.to],
			from: initialData[protocol.from],
			path: [],
			type: initialData[protocol.type],
			payload: initialData[protocol.payload],
			protocol: protocol
		};
		if(initialData.type != protocol.ignore){
			self.ondata(JSON.parse(e.data));
		}

	}

	this.servers.push({socket: ws, protocol: protocol});

	ws.promise = new Promise(function(resolve, reject){
		ws.onopen = function(){
			resolve(ws);
		};
		ws.onclose = function(){
			reject(ws);
		}
	})

	return ws;
}

/**
* Route exchange data to the correct Exchange.Manager
* @param  {JSON} data The JSON object to be routed
* @todo rewrite the case where we don't have a manager for that id and emit an 'offer' event
*/
Exchange.prototype.ondata = function(data) {
	if(this.managers[data.from] === undefined){
		this.managers[data.from] = {};
	}
	if(this.managers[data.from][data.label] !== undefined){
		this.managers[data.from][data.label].ondata(data.payload);
	}
	else {
		this.managers[data.from][data.label] = this._connect(data.from, data.label, {});
		this.trigger('peer', this.managers[data.from][data.label]);
		this.managers[data.from][data.label].ondata(data.payload);


	}
}

/**
* Sends data from the current node out into the network.
* The packet needs to have the "to" "from" and "path" attributes already set.
*
* @param  {JSON} data The data packet to be sent
*
* @todo  translate server data to and from exchange data with _.map or something similar.
*/
Exchange.prototype.emit = function(data, to, label) {

	for(var i = 0; i < this.servers.length; i++){
		//translate from exchange speak to server speak
		var server = this.servers[i];
		if(server.socket.readyState == 1){
			var serverData = {}
			serverData[server.protocol.to] = to;
			serverData[server.protocol.from] = this.id;
			serverData['label'] = label;
			serverData['payload'] = data;
			server.socket.send(JSON.stringify(serverData));
		}
	}

}

Exchange.prototype.on = function(event, callback) {
	try{
		this.events[event].push(callback);
	} catch(e){
		throw {message: event+" event doesn't exists", name:"EventException"};
	}
}

Exchange.prototype.trigger = function(event) {
	for(var e in this.events[event]){
		this.events[event][e].apply(this, arguments);
	}
}

/**
* Starts a connection to some remote peer through the exchange.
* @param  {String} id The ID to attempt to connect to.
* @return {Exchange.Manager} The Exchange.Manager handeling the handshake to the remote peer, you can access the peerconnection object from this.
*/
Exchange.prototype._connect = function(peer, label, config) {
	var self = this;
	if(this.managers[peer] === undefined){
		this.managers[peer] = {};
	}
	if(label === undefined) label = "base";
	if(config === undefined) config = {};

	this.managers[peer][label] = new Exchange.Manager(config);

	this.managers[peer][label].hook('post:icecandidate', function(name, evt){
		self.emit({
			type: 'CANDIDATE',
			payload: {
				candidate: evt.candidate
			}
		}, peer, label);
	});

	this.managers[peer][label].hook('post:localdescription', function(name, description, remote){
		if(remote){
			self.emit({
				type: 'ANSWER',
				payload: {
					sdp: description
				}
			}, peer, label);

		} else {
			self.emit({
				type: 'OFFER',  //Label for the message switch
				payload: {
					//browserisms: util.browserisms, //browser specific stuff
					sdp: description,                    //the info to connect to this peer
					config: this._options.config,  //connection config info
					labels: this.labels            //not sure
				}
			}, peer, label);

		}
	});
	return this.managers[peer][label];
}

//Think of this as a plugin:
//for audio video call
Exchange.prototype.call = function(peer, stream, label, config){
	var manager = this._connect(peer, label, config);
	var stream = manager.pc.addStream(stream);
	manager.initialize();
	return stream;
}

//for data connection
Exchange.prototype.openPipe = function(peer, options, label, config){
	var manager = this._connect(peer, label, config)
	var dc = manager.pc.createDataChannel(peer, options);
	manager.initialize();
	dc.promise = new Promise(function(resolve, reject){
		dc.onopen = function(){
			resolve(dc);
		};
		dc.onclose = function(){
			reject(dc);
		}
	})
	return dc;
}

var RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
var RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.RTCPeerConnection;
var RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;


/**
* Manages the handshake between two peers in the exchange.
* @constructor
* @param {String}     id       The ID of the local node.
* @param {String}     peer     The ID of the remote node.
* @param {Array}      path     If known, the path to follow to reach the remote node.
* @param {Exchange}   exchange The local exchange.
* @param {JSON}       options  Almost always empty (can specify a stun url that's about it)
* @param {Function}   callback [description]
*/
Exchange.Manager = function(config) {
	var self = this;
	//should set up defaults;
	if(config === undefined){
		config = {};
	}
	if(config.iceServers === undefined){
		config.iceServers = [{ 'url': 'stun:stun.l.google.com:19302' }];
	}
	if(config.protocol === undefined){
		config.protocol = {

			offer: 'OFFER',
			answer: 'ANSWER',
			candidate: 'CANDIDATE',
			port: 'PORT'
		}
	}
	this.protocol = config.protocol;
	this._options = config;
	// this.path = path;

	this.pc = null;

	// Mapping labels to metadata and serialization.
	// label => { metadata: ..., serialization: ..., reliable: ...}
	this.labels = {};
	// A default label in the event that none are passed in.
	this._default = 0;

	this._startPeerConnection();
	// if (!!this.id) {
	//   this.initialize();
	// }

};

/**
* Handle handshake data.
* @param  {JSON} data
*/
Exchange.Manager.prototype.ondata = function(data) {
	this._hook('pre:data', data);
	var self = this;
	switch(data.type) {
		case this.protocol.offer:
		self._setupIce();
		self.update(data.payload.labels);
		self.handleSDP(data.payload.sdp, data.type);
		break;
		case this.protocol.answer:
		this.handleSDP(data.payload.sdp, data.type);
		break;
		case this.protocol.candidate:
		this.handleCandidate(data.payload, data.type);
		break;
		default:
		this._hook('error:data', data);
		break;
	}
}

/**
* Initialize the manager.
* @param  {String} id The ID of the local node.
*/
Exchange.Manager.prototype.initialize = function() {

		// Firefoxism where ports need to be generated.
		/*if (util.browserisms === 'Firefox') {
		this._firefoxPortSetup();
	}*/

	// Set up PeerConnection.


	// Listen for ICE candidates.
	this._setupIce();

	// Listen for negotiation needed.
	// Chrome only--Firefox instead has to manually makeOffer.
	// if (util.browserisms !== 'Firefox') {
	this._setupNegotiationHandler();
	// } else if (this._options.originator) {
	// this._firefoxHandlerSetup()
	// this._firefoxAdditional()
	// }

	this.initialize = function() { };
};

/** Start a PC. */
Exchange.Manager.prototype._startPeerConnection = function() {
	this._hook('pre:peerconnection');
	this.pc = new RTCPeerConnection(this._options, { optional: [ { RtpDataChannels: true }, {DtlsSrtpKeyAgreement: true} ]});
	this._hook('post:peerconnection', this.pc);
};

/** Set up ICE candidate handlers. */
Exchange.Manager.prototype._setupIce = function() {
	var self = this;
	this.pc.onicecandidate = function(evt) {
		if (evt.candidate) {
			self._hook('post:icecandidate', evt);

		} else {
			self._hook('error:icecandidate', evt);
		}
	};
};

/**
* Creates an RTCSessionDescription and sends it back as an answer.
*/
Exchange.Manager.prototype._makeAnswer = function() {
	var self = this;
	this._hook('pre:createanswer');
	this.pc.createAnswer(function(answer) {
		self._hook('pre:localdescription', answer, true);
		self.pc.setLocalDescription(answer, function() {
			self._hook('post:localdescription', answer, true);
		}, function(err) {
			//throw err;
			self._hook('error:localdescription', err, answer, true);
		});
	}, function(err) {
		self._hook('error:createanswer');
	});
};

/** Set up onnegotiationneeded. */
Exchange.Manager.prototype._setupNegotiationHandler = function() {
	var self = this;

	if(window.webkitRTCPeerConnection !== undefined){
		this.pc.onnegotiationneeded = function() {
			self._makeOffer();
		};
	} else {
		self._makeOffer();
	}
};

/** Send an RTCSessionDescription offer for peer exchange. */
Exchange.Manager.prototype._makeOffer = function() {
	var self = this;
	this._hook('pre:createoffer');
	this.pc.createOffer(function setLocal(offer) {
		self._hook('pre:localdescription', offer, false);
		self.pc.setLocalDescription(offer, function() {
			self._hook('post:localdescription', offer, false);
		}, function handleError(err) {
			//throw err;
			self._hook('error:localdescription', offer, false);
		});
	}, function handleError(err){
		self._hook('error:createoffer', err);
	}, {
		optional: [],
		mandatory: {
			OfferToReceiveAudio: false,
			OfferToReceiveVideo: false,
			// MozDontOfferDataChannel: false
		}
	});
};

/** Handle an SDP. */
Exchange.Manager.prototype.handleSDP = function(sdp, type) {
	var self = this;
	this._hook('pre:remotedescription', sdp, type);
	sdp = new RTCSessionDescription(sdp);
	this.pc.setRemoteDescription(sdp, function() {
		if (type === 'OFFER') {
			self._makeAnswer();
		}
		self._hook('post:remotedescription', sdp, type);
	}, function(err) {
		//throw err;
		self._hook('error:remotedescription', err, sdp, type);
	});
};

/** Handle a candidate. */
Exchange.Manager.prototype.handleCandidate = function(message) {
	//trigger an event-hook
	this._hook('pre:addicecandidate', message);
	var candidate = new RTCIceCandidate(message.candidate);
	this.pc.addIceCandidate(candidate);
	this._hook('post:addicecandidate', candidate);
};

/** Updates label:[serialization, reliable, metadata] pairs from offer. */
Exchange.Manager.prototype.update = function(updates) {
	var labels = Object.keys(updates);
	for (var i = 0, ii = labels.length; i < ii; i += 1) {
		var label = labels[i];
		this.labels[label] = updates[label];
	}
};

Exchange.Manager.prototype._hook = function(name){
	//think about regex at some point to conform to semver

	if(!this.hooks){
		this.hooks = {};
	}
	if(!this.hooks[name]){
		this.hooks[name] = [];
	}
	for(var i = 0; i < this.hooks[name].length; i++){
		this.hooks[name][i].apply(this, arguments);
	}

}

Exchange.Manager.prototype.hook = function(name, callback){
	if(!this.hooks){
		this.hooks = {};
	}
	if(!this.hooks[name]){
		this.hooks[name] = [];
	}
	//should test for function
	this.hooks[name].push(callback);
}
