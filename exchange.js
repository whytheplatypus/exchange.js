
var problemDC;
var problemMessage;
/**
 * The Exchange class, creates an manages peer exchange logic accross a provided dc.
 * @constructor
 * @param  {String} id The id used to identify the local machiene
 */
var Exchange = function(id, onpeerconnection){
	var self = this;
	this.id = id;
    
	this.onpeerconnection = onpeerconnection;

    /**
     * [managers description]
     * @type {Object}
     */
    this.managers = {};
    
	if(arguments.length > 1){
		this.connections = arguments[1];
		for(var peer in this.connections){
			this.initDC(this.connections[peer]);
		}
	} else {
		/**
		 * Key/Value of directly connected peers
		 * @type {Object}
		 */
		this.connections = {};
	}
	this.servers = [];
	
	this.messages = {};

	this._send = function(message, peer){
		try{
			self.connections[peer].send(message);
		} catch(e){
			problemDC = self.connections[peer];
			problemMessage = message;
			console.log(problemMessage);
		}
	}
}

/**
 * setup a new datachannel to be used for exchange.
 * @param  {DataChannel} dc The datachannel used to send exchange information
 * 
 */
Exchange.prototype.initDC = function(dc) {
	var self = this;

	var datacallback = dc.onmessage;
	dc.onmessage = function(e){
		console.log(e);
		var data = e.data;
		try{
			data = JSON.parse(data);
			//console.log(data);
			if(data.exchange !== undefined){
				self.ondata(data);
			} else {
				datacallback(e);
			}
		} catch(error){
			console.log("parse error");
			console.log(e);
			datacallback(e);
		}
	}
}

/**
 * [ description]
 * @todo  test open.
 * @todo  data specific protocol names
 * @todo  let ignore be an array
 * @param  {[type]} ws       [description]
 * @param  {[type]} protocol [description]
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
 */
Exchange.prototype.ondata = function(data) {
	if(data.to != this.id){
		this.forward(data);
	} else if(data.type == 'reliable'){
		this.handleReliable(data);
	} else {
		if(data.path.indexOf(this.id) == -1){
			data.path.push(this.id);
		}
		if(this.managers[data.from] !== undefined){
			this.managers[data.from].ondata(data, data.path);
		} 
		else {
			this.managers[data.from] = new ExchangeManager(this.id, data.from, data.path.reverse(), this, {}, this.onpeerconnection);
			this.managers[data.from].ondata(data);
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
		//this.connections[data.to].send(JSON.stringify(data));
		this._send(JSON.stringify(data), data.to);
	} else if(data.path.indexOf(this.id)+1 == data.path.length || data.path.indexOf(this.id) == -1){
		if(data.path.indexOf(this.id) == -1){
			data.path.push(this.id);
		}
		for(var peer in this.connections){
			//don't send it back down the path
			if(data.path.indexOf(peer) == -1){
				this._send(JSON.stringify(data), peer);
				//this.connections[peer].send(JSON.stringify(data));
			}
		}
	} else if(data.path.indexOf(this.id) > -1){
		//the path is already set up
		var nextPeer = data.path[data.path.indexOf(this.id)+1];
		console.log(nextPeer);
		this._send(JSON.stringify(data), nextPeer);
		//this.connections[nextPeer].send(JSON.stringify(data));
	}
}

/**
 * Handles data that has been split up into smaller chuncks
 * labled by md5 hashes.
 * @param  {JSON} data The packet of data to be handled
 * 
 */
Exchange.prototype.handleReliable = function(data) {
	if(data.hasOwnProperty('hash')){
		if(this.messages[data.hash] === undefined && data.hasOwnProperty('count')){
			this.messages[data.hash] = new Array(data.count);
		}
		if(data.hasOwnProperty('data')){
			this.messages[data.hash][parseInt(data.key)] = data.data;
		}
		var ready = true;
		for(var chunk in this.messages[data.hash]){
			// console.log(hash);
			// console.log(this.messages[keys][hash]);
			ready = ready && (this.messages[data.hash][chunk].length > 0);
			//console.log(ready);
		}
		if(ready){
			//cleanup
			var newdata = "";
			for(var hash in this.messages[keys]){
				newdata += this.messages[keys][hash];
			}
			this.messages[data.hash] = null;
			delete this.messages[data.hash];
			//console.log(data);
			newdata = JSON.parse(newdata);
			newdata.path = data.path;
			newdata.from = data.from;
			newdata.to = data.to;

			this.ondata(newdata);
		}
		
	}
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
	var parts = [];
	var hash = md5(string);
	console.log(hash);
	for(var i = 0; i < string.length; i+=512){
		var str = string.substr(i, 512);
		parts.push(str);
	}
	// console.log(this.connections[peer]);
	
	var partsPacket = {exchange: "true", type:"reliable", path:path, from:this.id, to:to, hash: hash, count:parts.length};

	this._send(JSON.stringify(partsPacket), peer);
	//this.connections[peer].send(JSON.stringify(partsPacket));
	
	for(var key in parts){
		var part = {exchange: "true", type:"reliable", path:path, from:this.id, to:to, hash: hash, key:key, data: parts[key]};
		this._send(JSON.stringify(part), peer);
		//this.connections[peer].send(JSON.stringify(part));
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
Exchange.prototype.emit = function(data, to, path) {
	
	if(path.indexOf(to)+1 == path.length && path.indexOf(this.id) == -1){
		path.unshift(this.id);
	}
	if(this.connections[to] !== undefined){
		if(path.indexOf(this.id) == -1){
			path.push(this.id);
		}
		this.reliable(JSON.stringify(data), to, path, to);
	} else if(path.indexOf(this.id)+1 == path.length || path.indexOf(this.id) == -1){
		if(path.indexOf(this.id) == -1){
			path.push(this.id);
		}
	
		for(var peer in this.connections){
			//don't send it back down the path
			if(path.indexOf(peer) == -1){
				this.reliable(JSON.stringify(data), peer, [], to);
			}
		}
		for(var i = 0; i < this.servers.length; i++){
			//translate from exchange speak to server speak
			var server = this.servers[i];
			if(server.socket.readyState == 1){
				console.log(server);
				var serverData = {}
				serverData[server.protocol.to] = to;
				serverData[server.protocol.from] = this.id;
				serverData[server.protocol.type] = data.type;
				serverData[server.protocol.payload] = data.payload;
				console.log('sending to ', server.socket);
				console.log(serverData);
				server.socket.send(JSON.stringify(serverData));
			}
		}
	} else if(path.indexOf(this.id) > -1){
		//the path is already set up
		var nextPeer = path.indexOf(this.id)+1;
		this.reliable(JSON.stringify(data), path[nextPeer], path, to);
	}
	
}

/**
 * Starts a connection to some remote peer through the exchange.
 * @param  {String} id The ID to attempt to connect to.
 * @return {ExchangeManager} The ExchangeManager handeling the handshake to the remote peer, you can access the peerconnection object from this.
 */
Exchange.prototype.connect = function(peer) {
	console.log("connecting to ", peer);
	this.managers[peer] = new ExchangeManager(this.id, peer, [], this, {}, this.onpeerconnection);
	return this.managers[peer];
}


/**
 * @todo keep track of jumps and time out a request after some number
 * @todo identify all requests with a md5 hash
 * @todo custom error objects
 * @todo fix it so already broken up chunks get forwarded
 * @todo make it so we only start sending ice candidtates after we get an answer?
 * @todo verify that a packet has all the correct attributes set. (to, from, path).
 */
