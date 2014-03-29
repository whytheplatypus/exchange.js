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
	describe("#initWS(websocket, protocol)", function(){
		it("Should add the socket to the server list", function(done){
			peer1.exchange.initWS(peerjsServer, protocol);
			done();
			
		});
		it("Should add the socket to the server list", function(done){
			peer2.exchange.initWS(peerjsServer2, protocol);	
			done();
		});
		after(function(){
			describe("#connect(id)", function(){  
				this.timeout(10000);      
				var manager = peer1.exchange.connect(peer2.id);
		        var dc = manager.createDataChannel(manager.peer, {reliable : true});
		        console.log(dc);
		        dc.onopen = function(){
                    peer1.exchange.addDC(dc, peer2.id);
                    console.log(dc);
                };
		        it("Should send an offer.", function(done){
		        	peer2.exchange.on('peer', function(eventName, peerManager){
		        		expect(peerManager.pc).to.be.a(RTCPeerConnection);
		        		console.log(peerManager.pc);
		        		peerManager.pc.ondatachannel = function(e){
		        			console.log(e);
		        			e.channel.onopen = function(){
		        				peer2.servers = [];
		        				peer1.servers = [];
			        			peer2.exchange.addDC(e.channel, peerManager.peer);
			        			
			        			var m2 = peer2.exchange.connect(peer1.id, 'test');
			        			var dc2 = m2.createDataChannel(m2.peer, {reliable: true});
						        dc2.onopen = function(){
				                    done();
				                };
				                
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

