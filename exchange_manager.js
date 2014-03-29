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
function ExchangeManager(id, peer, path, exchange, config, label) {
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
  this._send = function(data){
    console.log(label);
    exchange.emit(data, peer, self.path, label);
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
ExchangeManager.prototype.ondata = function(data, path) {
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
ExchangeManager.prototype.initialize = function(id) {
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

ExchangeManager.prototype.createDataChannel = function(peer, options){
  var dc = this.pc.createDataChannel(peer, options);
  this.initialize();
  return dc;
}

/** Start a PC. */
ExchangeManager.prototype._startPeerConnection = function() {
  console.log("starting PC");
  this.pc = new RTCPeerConnection(this._options, { optional: [ { RtpDataChannels: true }, {DtlsSrtpKeyAgreement: true} ]});
};

/** Set up ICE candidate handlers. */
ExchangeManager.prototype._setupIce = function() {
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
      //throw err;
      console.log('Failed to setLocalDescription from PEX, ', err); //why is this fireing on the broker?
    });
  }, function(err) {
    //throw err;
    console.log('Failed to create answer, ', err);
  });
};

/** Set up onnegotiationneeded. */
ExchangeManager.prototype._setupNegotiationHandler = function() {
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
ExchangeManager.prototype._makeOffer = function() {
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
    //throw err;
    console.log('Failed to setRemoteDescription, ', err);
  });
};

/** Handle a candidate. */
ExchangeManager.prototype.handleCandidate = function(message) {
  console.log(message);
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