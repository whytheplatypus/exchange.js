

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
		var data = JSON.parse(e.data);
		//console.log(data);
		if(data.exchange){
			self.ondata(data);
		} else {
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
		var initialData = JSON.parse(e.data);
		console.log(initialData);
		var data = {
			to: initialData[protocol.to],
			from: initialData[protocol.from],
			path: [],
			type: initialData[protocol.type],
			payload: initialData[protocol.payload],
		};
		if(initialData.type != protocol.ignore){
			self.ondata(data);
		}
		
	}
	this.servers.push(ws);
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
			this.managers[data.from].ondata(data);
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
		this.connections[data.to].send(JSON.stringify(data));
	} else if(data.path.indexOf(this.id)+1 == data.path.length || data.path.indexOf(this.id) == -1){
		if(data.path.indexOf(this.id) == -1){
			data.path.push(this.id);
		}
		for(var peer in this.connections){
			//don't send it back down the path
			if(data.path.indexOf(peer) == -1){
				this.connections[peer].send(JSON.stringify(data));
			}
		}
	} else if(data.path.indexOf(this.id) > -1){
		//the path is already set up
		var nextPeer = data.path[data.path.indexOf(this.id)+1];
		console.log(nextPeer);
		this.connections[nextPeer].send(JSON.stringify(data));
	}
}

/**
 * Handles data that has been split up into smaller chuncks
 * labled by md5 hashes.
 * @param  {JSON} data The packet of data to be handled
 * 
 */
Exchange.prototype.handleReliable = function(data) {
	if(data.hasOwnProperty('hashes')){
		var keysString = data.hashes.join("/");
		this.messages[keysString] = {};
		for(var i = 0; i < data.hashes.length; i++){
			this.messages[keysString][data.hashes[i]] = false;
		}
	} else if(data.hasOwnProperty('hash')){
		//can check the hash here if we want
		//if(md5(data.data) == hash){}
		for(var keys in this.messages){
			//console.log(keys);
			if(keys.indexOf(data.hash) > -1){
				this.messages[keys][data.hash] = data.data;
				var ready = true;
				for(var hash in this.messages[keys]){
					// console.log(hash);
					// console.log(this.messages[keys][hash]);
					ready = ready && this.messages[keys][hash];
					//console.log(ready);
				}
				if(ready){
					//cleanup
					var newdata = "";
					for(var hash in this.messages[keys]){
						newdata += this.messages[keys][hash];
					}
					this.messages[keys] = null;
					delete this.messages[keys];
					//console.log(data);
					newdata = JSON.parse(newdata);
					newdata.path = data.path;
					this.ondata(newdata);
				}
			}		
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
	var parts = {}
	for(var i = 0; i < string.length; i+=512){
		var str = string.substr(i, 512);
		parts[md5(str)] = str;
	}

	this.connections[peer].send(JSON.stringify({exchange: true, type:'reliable', path:path, from:this.id, to:to, hashes: Object.keys(parts)}));
	for(var key in parts){
		this.connections[peer].send(JSON.stringify({exchange: true, type:'reliable', path:path, from:this.id, to:to, hash: key, data: parts[key]}));
	}
}

/**
 * Sends data from the current node out into the network.
 * The packet needs to have the "to" "from" and "path" attributes already set.
 * 
 * @param  {JSON} data The data packet to be sent
 * 
 */
Exchange.prototype.emit = function(data) {
	
	if(data.path.indexOf(data.to)+1 == data.path.length && data.path.indexOf(this.id) == -1){
		data.path.unshift(this.id);
	}
	if(this.connections[data.to] !== undefined){
		if(data.path.indexOf(this.id) == -1){
			data.path.push(this.id);
		}
		this.reliable(JSON.stringify(data), data.to, data.path, data.to);
	} else if(data.path.indexOf(this.id)+1 == data.path.length || data.path.indexOf(this.id) == -1){
		if(data.path.indexOf(this.id) == -1){
			data.path.push(this.id);
		}
	
		for(var peer in this.connections){
			//don't send it back down the path
			if(data.path.indexOf(peer) == -1){
				this.reliable(JSON.stringify(data), peer, data.path, data.to);
			}
		}
		for(var server in this.servers){
			console.log(data);
			console.log(this.servers[server]);
			this.servers[server].send(JSON.stringify(data));
		}
	} else if(data.path.indexOf(this.id) > -1){
		//the path is already set up
		var nextPeer = data.path.indexOf(this.id)+1;
		this.reliable(JSON.stringify(data), data.path[nextPeer], data.path, data.to);
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
