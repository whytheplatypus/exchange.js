
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
var BSON = bson().BSON;
var Exchange = function(id){
	var self = this;
	this.id = id;

    /**
     * {peer: ExchangeManager} pairs
     * @type {Object}
     */
    this.managers = {};
    
	if(arguments.length > 2){
		this.connections = arguments[2];
		for(var peer in this.connections){
			this.addDC(this.connections[peer], peer);
		}
	} else {
		/**
		 * Key/Value of directly connected peers
		 * @type {Object}
		 */
		this.connections = {};
	}

	this.events = {
		'peer': new Array()
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
	
	/**
	 * The currently building messages from reliable. {hash: [chunks], }
	 * @type {Object}
	 */
	this.messages = {};

	/**
	 * Local send wrapper.
	 * @param  {String} message The String to be sent.
	 * @param  {String} peer    The name of the datachannel in this.connections to send the message along.
	 */
	this._send = function(message, peer){
		try{
			if(self.connections[peer].readyState == 'open'){
				self.connections[peer].send(message);
			}
		} catch(e){
			console.log(e);
		}
	}
}

/**
 * setup a new datachannel to be used for exchange.
 * @param  {DataChannel} dc The datachannel used to send exchange information
 * 
 */
Exchange.prototype.addDC = function(dc, peer) {
	var self = this;

	var datacallback = dc.onmessage;
	var errorcallback = dc.onerror;
	dc.onmessage = function(e){
		var data = e.data;
		var keepParsing = true;
		while(keepParsing){
			try{
				data = JSON.parse(data);
			} catch(error){
				keepParsing = false;
			}
		}
		if(data.exchange !== undefined){
			self.ondata(data);
		} else {
			if(typeof datacallback === 'function'){
				datacallback(e);
			}
		}
	}
	dc.onerror = function(e){
		console.log('ERROR: ', e);
		if(typeof errorcallback === 'function'){
			errorcallback(e);
		}
    }
	self.connections[peer] = dc;
}

/**
 * Add a websocket server to the list of servers.
 * @todo  test open.
 * @todo  data specific protocol names
 * @todo  let ignore be an array
 * @param  {WebSocket} ws       An open websocket connection.
 * @param  {Object}    protocol The translation from our protocol to theirs.
 */
Exchange.prototype.initWS = function(ws, protocol) {
	var self = this;
	ws.onmessage = function(e){
		console.log(e);

		var initialData = JSON.parse(e.data);
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
			self.ondata(data);
		}
		
	}
	ws.onclose = function(e){

	}
	this.servers.push({socket: ws, protocol: protocol});
}

/**
 * Route exchange data to the correct ExchangeManager
 * @param  {JSON} data The JSON object to be routed
 * @todo rewrite the case where we don't have a manager for that id and emit an 'offer' event
 */
Exchange.prototype.ondata = function(data) {
	if(data.to != this.id){
		this.forward(data);
	} else {
		if(data.path.indexOf(this.id) == -1){
			data.path.push(this.id);
		}
		if(this.managers[data.from] !== undefined){
			this.managers[data.from].ondata(data, data.path);
		} 
		else {
			this.managers[data.from] = new ExchangeManager(this.id, data.from, data.path.reverse(), this, {});
			this.managers[data.from].ondata(data);
			this.trigger('peer', this.managers[data.from]);
		}
	}
}

/**
 * For data not ment for this node, pass it along.
 * Sends the data directly to the intended peer if
 * a conneciton already exists, passes the data to the
 * next node in the path if the path exists. Or broadcasts
 * the data.
 * @param  {JSON} data The data to be forwarded
 * 
 */
Exchange.prototype.forward = function(data) {
	console.log("forwarding: ", data);
	if(this.connections[data.to] !== undefined){
		if(data.path.indexOf(this.id) == -1){
			data.path.push(this.id);
		}
		//this.connections[data.to].send(BSON.serialize(data, false, true, false));
		this._send(BSON.serialize(data, false, true, false), data.to);
	} else if(data.path.indexOf(this.id)+1 == data.path.length || data.path.indexOf(this.id) == -1){
		if(data.path.indexOf(this.id) == -1){
			data.path.push(this.id);
		}
		for(var peer in this.connections){
			//don't send it back down the path
			if(data.path.indexOf(peer) == -1){
				this._send(BSON.serialize(data, false, true, false), peer);
				//this.connections[peer].send(BSON.serialize(data, false, true, false));
			}
		}
	} else if(data.path.indexOf(this.id) > -1){
		//the path is already set up
		var nextPeer = data.path[data.path.indexOf(this.id)+1];
		console.log(nextPeer);
		this._send(BSON.serialize(data, false, true, false), nextPeer);
		//this.connections[nextPeer].send(BSON.serialize(data, false, true, false));
	}
}

/**
 * Handles data that has been split up into smaller chuncks
 * labled by md5 hashes.
 * @param  {JSON} data The packet of data to be handled
 * 
 */
Exchange.prototype.handleReliable = function(data) {
	data.payload = BSON.deserialize(data.payload);
}

/**
 * Breakes up a string into reasonable chunks of data
 * and sends them out
 * @param  {String} string The string to be sent
 * @param  {String} peer   The ID of the peer in this.connections to send the data to.
 * @param  {Array}  path    The Path to send the data along
 * @param  {String} to     The ID of the peer we're sending the data to.
 * 
 */
Exchange.prototype.reliable = function(string, peer, path, to) {
	console.log(peer);
	var self = this;
	// console.log(this.connections[peer]);
	
	var packet = {exchange: "true", type:"reliable", path:path, from:this.id, to:to, payload: string};

	this._send(packet, peer);
}

/**
 * Sends data from the current node out into the network.
 * The packet needs to have the "to" "from" and "path" attributes already set.
 * 
 * @param  {JSON} data The data packet to be sent
 *
 * @todo  translate server data to and from exchange data with _.map or something similar.
 */
Exchange.prototype.emit = function(data, to, path) {
	
	if(path.indexOf(to)+1 == path.length && path.indexOf(this.id) == -1){
		path.unshift(this.id);
	}
	if(this.connections[to] !== undefined){
		if(path.indexOf(this.id) == -1){
			path.push(this.id);
		}
		this.reliable(BSON.serialize(data, false, true, false), to, path, to);
	} else if(path.indexOf(this.id)+1 == path.length || path.indexOf(this.id) == -1){
		if(path.indexOf(this.id) == -1){
			path.push(this.id);
		}
	
		for(var peer in this.connections){
			//don't send it back down the path
			if(path.indexOf(peer) == -1){
				this.reliable(BSON.serialize(data, false, true, false), peer, [], to);
			}
		}
		for(var i = 0; i < this.servers.length; i++){
			//translate from exchange speak to server speak
			var server = this.servers[i];
			if(server.socket.readyState == 1){
				var serverData = {}
				serverData[server.protocol.to] = to;
				serverData[server.protocol.from] = this.id;
				serverData[server.protocol.type] = data.type;
				serverData[server.protocol.payload] = data.payload;
				server.socket.send(JSON.stringify(serverData));
			}
		}
	} else if(path.indexOf(this.id) > -1){
		//the path is already set up
		var nextPeer = path.indexOf(this.id)+1;
		this.reliable(BSON.serialize(data, false, true, false), path[nextPeer], path, to);
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
 * @return {ExchangeManager} The ExchangeManager handeling the handshake to the remote peer, you can access the peerconnection object from this.
 */
Exchange.prototype.connect = function(peer) {
	console.log("connecting to ", peer);
	this.managers[peer] = new ExchangeManager(this.id, peer, [], this, {});
	return this.managers[peer];
}