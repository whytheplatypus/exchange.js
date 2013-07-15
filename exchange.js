

/**
 * The Exchange class, creates an manages peer exchange logic accross a provided dc
 * @param  {String} id The id used to identify the local machiene
 */
var Exchange = function(id){
	var self = this;
	this.id = id;
    
    /**
     * [managers description]
     * @type {Object}
     */
    this.managers = {};
    
	if(arguments.length > 1){
		this.connections = arguments[1];
		for(var peer in this.connections){
			this.initDC(this.connections[peer], peer);
		}
	} else {
		/**
		 * Key/Value of directly connected peers
		 * @type {Object}
		 */
		this.connections = {};
	}
	
	this.messages = {};
}

/**
 * [ description]
 * @param  {DataChannel} dc The datachannel used to send exchange information
 * @return {[type]}    [description]
 */
Exchange.prototype.initDC = function(dc, peer, callback) {
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
	this.managers[peer] = new ExchangeManager(this.id, peer, [], this, {config:{}}, callback);
	return this.managers[peer];
}

/**
 * [ description]
 * @param  {[type]} data [description]
 * @return {[type]}      [description]
 */
Exchange.prototype.ondata = function(data) {
	if(data.path.indexOf(this.id) == -1){
		data.path.push(this.id);
	}
	if(data.type == 'reliable'){
		this.handleReliable(data);
	}
	else if(data.to != this.id){
		this.emit(data);
	} else {
		
		//flip the path;
		if(this.managers[data.from]){
			this.managers[data.from].ondata(data);
		} 
		// else {
		// 	this.managers[data.from] = new ExchangeManager(this.id, data.from, data.path.reverse(), this, {config:{}});
		// 	this.managers[data.from].ondata(data);
		// }
	}
}

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
					var data = "";
					for(var hash in this.messages[keys]){
						data += this.messages[keys][hash];
					}
					this.messages[keys] = null;
					delete this.messages[keys];
					console.log(data);
					this.ondata(JSON.parse(data));
				}
			}		
		}
		
	}
}

Exchange.prototype.reliable = function(string, peer) {
	var parts = {}
	for(var i = 0; i < string.length; i+=512){
		var str = string.substr(i, 512);
		parts[md5(str)] = str;
	}

	this.connections[peer].send(JSON.stringify({exchange: true, type:'reliable', to:peer, hashes: Object.keys(parts)}));
	for(var key in parts){
		this.connections[peer].send(JSON.stringify({exchange: true, type:'reliable', to:peer, hash: key, data: parts[key]}));
	}
}

/**
 * [ description]
 * @param  {[type]} data [description]
 * @return {[type]}      [description]
 */
Exchange.prototype.emit = function(data) {
	console.log(data);
	if(this.connections[data.to] !== undefined){
		this.reliable(JSON.stringify(data), data.to);
	} else if(data.path.indexOf(this.id) == -1){
		data.path.push(this.id);
	
		for(var peer in this.connections){
			//don't send it back down the path
			if(data.path.indexOf(peer) > -1){
				this.reliable(JSON.stringify(data), peer);
			}
		}
	} else if(data.path.indexOf(this.id) > -1){
		//the path is already set up
		var nextPeer = data.path.indexOf(this.id)+1;
		this.reliable(JSON.stringify(data), data.path[nextPeer]);
	}
	
}

/**
 * [ description]
 * @param  {String} id The id to attempt to connect to
 * @return {DataChannel}    [description]
 */
Exchange.prototype.connect = function(peer) {
	console.log("connecting to ", peer);
	this.managers[peer] = new ExchangeManager(this.id, peer, [], this, {config:{}});
	return this.managers[peer];
}

//@todo keep track of jumps and time out a request after some number
//@todo identify all requests with a md5 hash
//@todo custom error objects
//@todo fix it so already broken up chunks get forwarded
//@todo make it so we only start sending ice candidtates after we get an answer?