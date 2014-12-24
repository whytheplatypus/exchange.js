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

describe('Exchange', function(){
	peer1.exchange = new Exchange(peer1.id);
	peer2.exchange = new Exchange(peer2.id);
	describe("#id", function(){
		it("Should have the same id as the peer", function(){
			expect(peer1.exchange.id).to.eql(peer1.id);
			expect(peer1.exchange.id).not.to.eql(peer2.exchange.id);
		});
	});
	describe("#initServer(websocket, protocol)", function(){
		it("Should add the socket to the server list", function(done){
			peer1.exchange.initServer(peerjsServer, protocol).promise.then(function(){
  			done();
        peer1.exchange.on('pre:data', function(name, data){
          if(data.peers)
            throw "we're ignoring the graph for now";
        });
      });

		});
		it("Should add the socket to the server list", function(done){
			peer2.exchange.initServer(peerjsServer2, protocol).promise.then(function(){
  			done();
        peer2.exchange.on('pre:data', function(name, data){
          if(data.peers)
            throw "we're ignoring the graph for now";
        });
      });
		});
		after(function(){
			describe("#connect(id)", function(){
				this.timeout(10000);
        it("Should establish a connection.", function(done){
          setTimeout(function(){
            var manager = peer1.exchange._connect(peer2.id);
            var dc = manager.createDataChannel(manager.peer, {reliable : true});
            console.log(dc);
            dc.onopen = function(){
              console.log(dc);

              dc.onmessage = function(message){
                console.debug(message)
                dc.send("pong")
                done();
              }

            };
          }, 2000)
          peer2.exchange.on('peer', function(eventName, peerManager){
            expect(peerManager.pc).to.be.a(RTCPeerConnection);
            console.log(peerManager.pc);
            peerManager.pc.ondatachannel = function(e){
              console.log(e);

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


			});
		});
	});

});

describe('ExchangeManager', function(){

});
