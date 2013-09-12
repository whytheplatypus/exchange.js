var host = 'localhost'
    ,port = 8000;

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
var peerjsServer = 'ws://' + host + ':' + port + '/?id='+peer1.id;
var _socket1 = new WebSocket(peerjsServer);
var peerjsServer2 = 'ws://' + host + ':' + port + '/?id='+peer2.id;
var _socket2 = new WebSocket(peerjsServer2);

describe('Exchange', function(){
	peer1.exchange = new Exchange(peer1.id);
	peer2.exchange = new Exchange(peer2.id);
	describe("#id", function(){
		it("Should hve the same id as the peer", function(){
			expect(peer1.exchange.id).to.eql(peer1.id);
			expect(peer1.exchange.id).not.to.eql(peer2.exchange.id);
		});
	});
	describe("#initWS(websocket, protocol)", function(){
		var isDone = 0;
		it("Should add the socket to the server list", function(done){
			_socket1.onopen = function(){
				peer1.exchange.initWS(_socket1, protocol);
				expect(peer1.exchange.servers[0].socket).to.eql(_socket1);
				expect(peer1.exchange.servers[0].protocol).to.eql(protocol);
				done();
			};
		});
		it("Should add the socket to the server list", function(done){
			_socket2.onopen = function(){
				peer2.exchange.initWS(_socket2, protocol);	
				expect(peer2.exchange.servers[0].socket).to.eql(_socket2);
				expect(peer2.exchange.servers[0].protocol).to.eql(protocol);
				done();
			};
		});
		after(function(){
			describe("#connect(id)", function(){        
				var manager = peer1.exchange.connect(peer2.id);
		        var dc = manager.pc.createDataChannel(manager.peer, { reliable: false });
		        dc.onopen = function(){
                    console.log("I'm open I'm open!!!");
                };
		        it("Should send an offer.", function(done){
		        	peer2.exchange.on('peer', function(eventName, peerManager){
		        		expect(peerManager.pc).to.be.a(RTCPeerConnection);
		        		done();
		        	});
		        });
		        
		        // dc.onerror = function(e){
		        //     console.log('ERROR: ', e);
		        // }
		        // dc.onopen = function(){
		        //     console.log("I'm open I'm open!!!");
		        //     // self.exchange.addDC(dc, manager.peer);
		        //     dc.send("world hello!");
		            
		        // }
		        // dc.onmessage = function(msg){
		        //     console.log(msg);
		        // }
		        describe("#managers", function(){
					it("Should have an empty hash of managers", function(){
						// expect(peer1.exchange.managers).to.eql({});
					});
				});
			});
		});
	});
	
});

describe('ExchangeManager', function(){
	
});

