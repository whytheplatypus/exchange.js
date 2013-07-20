
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
function ExchangeManager(id, peer, path, exchange, config, callback) {

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
  this._send = function(data){
    data.exchange = true;
    data.path = this.path;
    data.from = id;
    data.to = peer;
    exchange.emit(data);
  };
  this.id = id; //local peer
  this.peer = peer; //remote peer
  this.pc = null;

  // Mapping labels to metadata and serialization.
  // label => { metadata: ..., serialization: ..., reliable: ...}
  this.labels = {};
  // A default label in the event that none are passed in.
  this._default = 0;

  if(typeof(callback) == "function"){
    this.onpeerconnection = callback;
  } else {
    this.onpeerconnection = function(pc){};
  }

  if (!!this.id) {
    this.initialize();
  }
};

/**
 * Handle handshake data.
 * @param  {JSON} data
 */
ExchangeManager.prototype.ondata = function(data) {
  this.path = data.path.reverse();
  
  switch(data.type) {
    case this.protocol.offer:
      this.update(data.payload.labels);
      this.handleSDP(data.payload.sdp, data.type);
      break;
    case this.protocol.answer:
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
ExchangeManager.prototype.initialize = function(id) {
  if (!!id) {
    this.id = id;
  }

  // Firefoxism where ports need to be generated.
  /*if (util.browserisms === 'Firefox') {
    this._firefoxPortSetup();
  }*/

  // Set up PeerConnection.
  this._startPeerConnection();

  // Listen for ICE candidates.
  this._setupIce();

  // Listen for negotiation needed.
  // Chrome only--Firefox instead has to manually makeOffer.
//  if (util.browserisms !== 'Firefox') {
  this._setupNegotiationHandler();
//  } else if (this._options.originator) {
//  //  this._firefoxHandlerSetup()
//  //  this._firefoxAdditional()
//  }

  this.initialize = function() { };
};

/** Start a PC. */
ExchangeManager.prototype._startPeerConnection = function() {
  console.log("starting PC");
  this.pc = new RTCPeerConnection(this._options.config, { optional: [ { RtpDataChannels: true } ]});
  this.onpeerconnection(this.pc);
};

/** Set up ICE candidate handlers. */
ExchangeManager.prototype._setupIce = function() {
  var self = this;
  console.log("setting up ICE");
  this.pc.onicecandidate = function(evt) {
    if (evt.candidate) {
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
ExchangeManager.prototype._makeAnswer = function() {
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
      throw err;
      console.log('Failed to setLocalDescription from PEX, ', err); //why is this fireing on the broker?
    });
  }, function(err) {
    throw err;
    console.log('Failed to create answer, ', err);
  });
};

/** Set up onnegotiationneeded. */
ExchangeManager.prototype._setupNegotiationHandler = function() {
  var self = this;
  console.log('Listening for `negotiationneeded`');
  this.pc.onnegotiationneeded = function() {
    console.log('`negotiationneeded` triggered');
    self._makeOffer();
  };
};

/** Send an RTCSessionDescription offer for peer exchange. */
ExchangeManager.prototype._makeOffer = function() {
  var self = this;
  this.pc.createOffer(function setLocal(offer) {
    self.pc.setLocalDescription(offer, function() {
      console.log('Set localDescription to offer');
      console.log('Created offer.');
      // console.log(offer);
      // console.log(offer.sdp.indexOf('\n'));
      // console.log(offer.sdp.indexOf('&crarr;'));
      // console.log(offer.sdp.indexOf("&#8629;"));
      // console.log(escape(offer.sdp));
      self._send({
        type: 'OFFER',  //Label for the message switch
        payload: {
          //browserisms: util.browserisms, //browser specific stuff
          sdp: offer,                    //the info to connect to this peer
          config: self._options.config,  //connection config info
          labels: self.labels            //not sure
        }
      });
      // We can now reset labels because all info has been communicated.
      self.labels = {};
    }, function handleError(err) {
      throw err;
      console.log('Failed to setLocalDescription, ', err);
    });
  });
};

//Public methods

/** Firefoxism: handle receiving a set of ports. */
ExchangeManager.prototype.handlePort = function(ports) {
  console.log('Received ports, calling connectDataConnection.');
  if (!ExchangeManager.usedPorts) {
    ExchangeManager.usedPorts = [];
  }
  ExchangeManager.usedPorts.push(ports.local);
  ExchangeManager.usedPorts.push(ports.remote);
  this.pc.connectDataConnection(ports.local, ports.remote);
};

/** Handle an SDP. */
ExchangeManager.prototype.handleSDP = function(sdp, type) {
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
    throw err;
    console.log('Failed to setRemoteDescription, ', err);
  });
};

/** Handle a candidate. */
ExchangeManager.prototype.handleCandidate = function(message) {
  var candidate = new RTCIceCandidate(message.candidate);
  this.pc.addIceCandidate(candidate);
  console.log('Added ICE candidate.');
};

/** Updates label:[serialization, reliable, metadata] pairs from offer. */
ExchangeManager.prototype.update = function(updates) {
  var labels = Object.keys(updates);
  for (var i = 0, ii = labels.length; i < ii; i += 1) {
    var label = labels[i];
    this.labels[label] = updates[label];
  }
};