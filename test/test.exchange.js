var host = 'relay.whytheplatypus.technology'
    ,port = 80;

var protocol = {
    to: 'to',
    from: 'from',
    type: 'type',
    payload: 'payload',
    ignore: '',
    offer: 'OFFER',
    answer: 'ANSWER',
    candidate: 'CANDIDATE',
    port: 'PORT'
};
var peer1 = {
	id:Math.random().toString(36).substr(2)
};
var peer2 = {
	id:Math.random().toString(36).substr(2)
};
var peer3 = {
	id:Math.random().toString(36).substr(2)
};
var peerjsServer = 'ws://' + host + ':' + port + '/?id='+peer1.id;
// var _socket1 = new WebSocket(peerjsServer);
var peerjsServer2 = 'ws://' + host + ':' + port + '/?id='+peer2.id;
// var _socket2 = new WebSocket(peerjsServer2);
// _socket2.onclose = function(){console.log('2 closed');};
// _socket1.onclose = function(){console.log('1 closed');};
peer1.exchange = new Exchange(peer1.id);
peer2.exchange = new Exchange(peer2.id);
peer1.server = peer1.exchange.initServer(peerjsServer, protocol);
peer2.server = peer2.exchange.initServer(peerjsServer2, protocol);
describe('Exchange', function(){

	describe("#id", function(){
		it("Should have the same id as the peer", function(){
			expect(peer1.exchange.id).to.eql(peer1.id);
			expect(peer1.exchange.id).not.to.eql(peer2.exchange.id);
		});
	});
	describe("#initServer(websocket, protocol)", function(){
		it("Should add the socket to the server list", function(done){

      peer1.server.promise.then(function(){
  			done();
        peer1.exchange.on('pre:data', function(name, data){
          if(data.peers)
            throw "we're ignoring the graph for now";
        });
      });

		});
		it("Should add the socket to the server list", function(done){

      peer2.server.promise.then(function(){
  			done();
        peer2.exchange.on('pre:data', function(name, data){
          if(data.peers)
            throw "we're ignoring the graph for now";
        });
        peer2.exchange.on('peer', function(eventName, peerManager){
          console.info("got a peer");
          expect(peerManager.pc).to.be.a(RTCPeerConnection);
          console.log(peerManager.pc);
          peerManager.pc.ondatachannel = function(e){
            console.log(e);
            console.debug("channel!");
            e.channel.onopen = function(){
              e.channel.onmessage = function(message){
                console.debug(message);
              }
              console.log("OPEN!");
              setInterval(function(){
                console.log("sending");
                e.channel.send("ping");
              }, 1000)

            }
          };

        });
      });
		})
  });
  describe("#connect(id)", function(){
    this.timeout(10000);
    it("Should establish a connection.", function(done){
      Promise.all([peer1.server.promise, peer2.server.promise]).then(function(){
        var manager = peer1.exchange._connect(peer2.id);
        var dc = manager.createDataChannel(manager.peer, {reliable : true});
        console.log(dc);
        dc.onopen = function(){
          console.log(dc);

          dc.onmessage = function(message){
            console.debug(message)
            dc.send("pong")
            console.info("says it's done");
            done();
          }

        };
      });
    });
  });

});

describe('ExchangeManager', function(){

});
