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
var peerjsServer2 = 'ws://' + host + ':' + port + '/?id='+peer2.id;
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
		it("Should add the socket to the server list", function(){

      peer1.server.promise.then(function(){
        peer1.exchange.on('pre:data', function(name, data){
          if(data.peers)
            throw "we're ignoring the graph for now";
        });
      });

		});
		it("Should add the socket to the server list", function(){

      peer2.server.promise.then(function(){

        peer2.exchange.on('pre:data', function(name, data){
          if(data.peers)
            throw "we're ignoring the graph for now";
        });
        peer2.exchange.on('peer', function(eventName, peerManager){

          expect(peerManager.pc).to.be.a(RTCPeerConnection);

          peerManager.pc.ondatachannel = function(e){


            e.channel.onopen = function(){
              e.channel.onmessage = function(message){

              }

              setInterval(function(){

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


        var dc = peer1.exchange.openPipe(peer2.id, {reliable : true});
        dc.promise.then(function(){
          dc.onmessage = function(message){
            dc.send("pong")

            return done();
          }
        })
      });
    });
  });

});

describe('ExchangeManager', function(){

});
