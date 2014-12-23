
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
		'peers': new Array()
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
		console.log(e);
		var initialData = JSON.parse(e.data);
		if(initialData.peers !== undefined){
			console.log("running peers");
			console.log(initialData.peers);
			self.trigger('peers', initialData.peers);
		} else {
			console.log(initialData);
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

	}
	ws.onclose = function(e){
		//remove server
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
	console.log("handeling", data);
	if(data.to != this.id){
		this.forward(data);
	} else {
		if(this.managers[data.from] === undefined){
			this.managers[data.from] = {};
		}
		if(this.managers[data.from][data.label] !== undefined){
			console.log("our type", data.payload.type);
			this.managers[data.from][data.label].ondata(data.payload, data.path);
		}
		else {
			console.log("our type", data.payload.type);
			console.log(this.id+" creating new manager for "+data.from);
			console.log("with label" + data.label);
			this.managers[data.from][data.label] = new Exchange.Manager(this.id, data.from, data.path.reverse(), this, {}, data.label);

			this.managers[data.from][data.label].ondata(data.payload);
			this.trigger('peer', this.managers[data.from][data.label]);
		}
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
Exchange.prototype._connect = function(peer, label) {
	console.log("connecting to ", peer);
	if(label == undefined){
		label = "base";
	}
	if(this.managers[peer] === undefined){
		this.managers[peer] = {};
	}
	console.log("label ", label);
	this.managers[peer][label] = new Exchange.Manager(this.id, peer, [], this, {}, label);
	return this.managers[peer][label];
}

//for audio video call
Exchange.prototype.call = function(peer, label){

}

//for data connection
Exchange.prototype.connect = function(peer, label){

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
Exchange.Manager = function(id, peer, path, exchange, config, label) {
	var self = this;
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
	this.path = path;
	this.label = label
	this._send = function(data){
		console.log(label);
		exchange.emit(data, peer, self.path, self.label);
	};
	this.id = id; //local peer
	this.peer = peer; //remote peer
	this.pc = null;
	this.exchange = exchange;
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
Exchange.Manager.prototype.ondata = function(data, path) {
	var self = this;
	if(path !== undefined){
		this.path = path.reverse();
	}
	switch(data.type) {
		case this.protocol.offer:
		console.log("got offer");
		self._setupIce();
		self.update(data.payload.labels);
		self.handleSDP(data.payload.sdp, data.type);
		break;
		case this.protocol.answer:
		console.log("got answer");
		this.handleSDP(data.payload.sdp, data.type);
		break;
		case this.protocol.candidate:
		this.handleCandidate(data.payload, data.type);
		break;
		case this.protocol.port:
		this.handlePort(data.payload);
		break;
		default:
		console.log("got data I didn't know what to do with: ", data);
		break;
	}
}

/**
* Initialize the manager.
* @param  {String} id The ID of the local node.
*/
Exchange.Manager.prototype.initialize = function(id) {
	if (!!id) {
		this.id = id;
	}

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

Exchange.Manager.prototype.createDataChannel = function(peer, options){
	var dc = this.pc.createDataChannel(peer, options);
	this.initialize();
	return dc;
}

Exchange.Manager.prototype.createVideoChannel = function(stream){
	console.log(this.pc);
	var stream = this.pc.addStream(stream);
	this.initialize();
	return stream;
}

/** Start a PC. */
Exchange.Manager.prototype._startPeerConnection = function() {
	console.log("starting PC");
	this.pc = new RTCPeerConnection(this._options, { optional: [ { RtpDataChannels: true }, {DtlsSrtpKeyAgreement: true} ]});
};

/** Set up ICE candidate handlers. */
Exchange.Manager.prototype._setupIce = function() {
	var self = this;
	console.log("setting up ICE");
	this.pc.onicecandidate = function(evt) {
		if (evt.candidate) {
			console.log(evt.candidate);
			self._send({
				type: 'CANDIDATE',
				payload: {
					candidate: evt.candidate
				}
			});
		}
	};
};

/**
* Creates an RTCSessionDescription and sends it back as an answer.
*/
Exchange.Manager.prototype._makeAnswer = function() {
	var self = this;
	this.pc.createAnswer(function(answer) {
		console.log('Created answer.');
		self.pc.setLocalDescription(answer, function() {
			console.log('Set localDescription to answer.');
			self._send({
				type: 'ANSWER',
				payload: {
					sdp: answer
				}
			});
		}, function(err) {
			//throw err;
			console.log('Failed to setLocalDescription from PEX, ', err); //why is this fireing on the broker?
		});
	}, function(err) {
		//throw err;
		console.log('Failed to create answer, ', err);
	});
};

/** Set up onnegotiationneeded. */
Exchange.Manager.prototype._setupNegotiationHandler = function() {
	var self = this;

	if(window.webkitRTCPeerConnection !== undefined){
		console.log('Listening for `negotiationneeded`');
		this.pc.onnegotiationneeded = function() {
			console.log('`negotiationneeded` triggered');
			self._makeOffer();
		};
	} else {
		self._makeOffer();
	}
};

/** Send an RTCSessionDescription offer for peer exchange. */
Exchange.Manager.prototype._makeOffer = function() {
	var self = this;
	this.pc.createOffer(function setLocal(offer) {
		console.log('Set localDescription to', offer);
		self.pc.setLocalDescription(offer, function() {
			console.log('Set localDescription to', offer);
			self._send({
				type: 'OFFER',  //Label for the message switch
				payload: {
					//browserisms: util.browserisms, //browser specific stuff
					sdp: offer,                    //the info to connect to this peer
					config: self._options.config,  //connection config info
					labels: self.labels            //not sure
				}
			});
		}, function handleError(err) {
			//throw err;
			console.log('Failed to setLocalDescription, ', err);
		});
	}, function handleError(err){
		console.log('Failed to create offer, ', err);
	}, {
		optional: [],
		mandatory: {
			OfferToReceiveAudio: false,
			OfferToReceiveVideo: false,
			// MozDontOfferDataChannel: false
		}
	});
};

//Public methods

/** Firefoxism: handle receiving a set of ports. */
Exchange.Manager.prototype.handlePort = function(ports) {
	console.log('Received ports, calling connectDataConnection.');
	if (!Exchange.Manager.usedPorts) {
		Exchange.Manager.usedPorts = [];
	}
	Exchange.Manager.usedPorts.push(ports.local);
	Exchange.Manager.usedPorts.push(ports.remote);
	this.pc.connectDataConnection(ports.local, ports.remote);
};

/** Handle an SDP. */
Exchange.Manager.prototype.handleSDP = function(sdp, type) {
	console.log("got "+type);
	sdp = new RTCSessionDescription(sdp);
	console.log(sdp);
	var self = this;
	this.pc.setRemoteDescription(sdp, function() {
		console.log('Set remoteDescription: ' + type);
		if (type === 'OFFER') {
			self._makeAnswer();
		}
	}, function(err) {
		//throw err;
		console.log('Failed to setRemoteDescription, ', err);
	});
};

/** Handle a candidate. */
Exchange.Manager.prototype.handleCandidate = function(message) {
	console.log(message);
	var candidate = new RTCIceCandidate(message.candidate);
	this.pc.addIceCandidate(candidate);
	console.log('Added ICE candidate.');
};

/** Updates label:[serialization, reliable, metadata] pairs from offer. */
Exchange.Manager.prototype.update = function(updates) {
	var labels = Object.keys(updates);
	for (var i = 0, ii = labels.length; i < ii; i += 1) {
		var label = labels[i];
		this.labels[label] = updates[label];
	}
};
