let m = 64n;

class ChordNode {
	constructor(hash, funcs, { stabilizeInterval }) {
		this.own_id = hash;
		this.successor = null;
		this.predecessor = null;
		//m is the power of 4
		//keep bigint in mind
		//encode bigint as hex; decode when handle rpc
		this.next = 1n;
		this.functions = funcs;
		//includes connect, disconnect, isConnected, hasConnection, send_rpc,
		//query_successors

		setInterval(() => {
			this.stabilize();
		}, stabilizeInterval);
	}

	// create()
	// this.successor = this.own_id
	create() {
		this.successor = this.own_id;
	}

	// notify(n)
	// send_rpc(NOTIFY, n) // calls peer.send()
	notify(id) {
		this.functions.send_rpc(id, {
			type: "NOTIFY",
		}); //?
	}

	// join(id) // id is guaranteed to be this.successor based on server
	// this.successor = id
	// peer.connect(this.successor)
	// notify(this.successor)
	join(id) {
		this.successor = id;
		this.functions.connect(this.successor).then(() => {
			this.notify(this.successor);
		});
	}
	// stabilize()
	// p’ = send_rpc(GET_PREDECESSOR, this.successor)
	// if this.own_id < p’ < this.successor || (p > s && (p’ > p || p’ < s)):
	// 	if !peer.hasConnection(p’):
	// 		peer.connect(p’)
	// 	else if peer.getConnection(p’).connected == true:
	// 		old_successor, this.successor = this.successor, p’
	// peer.disconnect(old_successor)
	// notify(this.successor)
	stabilize() {
		//this.predecessor of this.successor

		this.functions
			.send_rpc(this.successor, {
				type: "GET_PREDECESSOR",
			})
			.then((ps) => {
				if (!ps) return;
				ps = BigInt(ps);
				if (
					(this.own_id < ps && ps < this.successor) ||
					(this.own_id > this.successor &&
						(ps > this.own_id || ps < this.successor))
				) {
					let old_successor = this.successor;
					if (!this.functions.hasConnection(ps)) {
						this.functions.connect(ps);
					} else if (this.functions.isConnected(ps)) {
						this.successor = ps;
						this.functions.disconnect(old_successor);
					}
				}
			});
		this.notify(this.successor);
	}

	// handle_rpc(type, sender)
	// switch type:
	// case NOTIFY:
	// 		if this.predecessor < sender < this.own_id:
	// 			this.predecessor = sender
	// 	case GET_PREDECESSOR:
	// 		respond_rpc(this.predecessor)
	handle_rpc(sender, data, resolve_rpc) {
		//sender is a BigInt
		switch (data.type) {
			case "NOTIFY":
                if (
                    (this.predecessor < sender && sender < this.own_id) ||
                    this.predecessor === null
                ) {
                    this.predecessor = sender;
                }
				resolve_rpc(null);
			case "GET_PREDECESSOR":
				resolve_rpc(
					this.predecessor ? this.predecessor.toString() : null
				);
			case "FIND_SUCCESSOR":
				find_id = BigInt(data.content);
				find_successor(find_id).then((answer) => {
					answer = answer.toString();
					resolve_rpc(answer);
				});
			default:
				return;
		}
	}
	// peer.on_disconnect(id)
	// if id == this.predecessor:
	// 	this.predecessor = null
	// else if id == this.successor:
	// 	successor_list = query_server_for_successors(2 minutes) // then:
	// 	connected = false
	// 	while !connected: // reattempt current this.successor, then loop list
	// 		peer.connect(this.successor) // then:
	// 		success:
	// 			connected = true
	// 		failure:
	// 	this.successor = successor_list.this.next(this.successor)
	// 	if no this.next this.successor, throw error, break
	// 	notify(this.successor)
	on_disconnect(id) {
		if (id == this.predecessor) {
			this.predecessor = null;
		} else if (id == this.successor) {
			let successorList = this.functions.query_successors().then(() => {
				successorIndex = 0;
				if (this.successor == null) {
					throw "no this.successor";
				}
				let connected = false;
				let attemptConnection = () => {
					this.functions
						.connect(this.successor)
						.then(() => {
							connected = true;
						})
						.catch(() => {
							//do nothing
							successorIndex = successorIndex + 1;
							// 	if no this.next this.successor, throw error, break
							if (successorIndex >= successorList.length) {
								throw "no this.successor"; //deal with this later
							}
							this.successor = successorList[successorIndex];
							attemptConnection();
						});
				};
			});
		}
		this.notify(this.successor);
	}
	// fix_fingers(this.next)
	// this.next = this.next + 1
	// if this.next > m:
	// 	this.next = 1
	// correct_finger = find_successor(this.own_id + 4^(this.next-1))
	// if fingers[this.next] != correct_finger:
	// 	if !peer.hasConnection(correct_finger):
	// 		peer.connect(correct_finger)
	// 		peer.disconnect(fingers[this.next])
	// 	fingers[this.next] = correct_finger
	// initialize this.next to 1n
	fix_fingers() {
		this.next = this.next + 1n;
		if (this.next > m) {
			this.next = 1n;
		}
		correct_finger = find_successor(this.own_id + 4n ** (this.next - 1n));
		if (fingers[this.next] != correct_finger) {
			if (!this.functions.hasConnection(correct_finger)) {
				this.functions
					.connect(correct_finger)
					.then(() => {
						return this.functions.disconnect(fingers[this.next]);
						//might need to care about edge case where neg
						//and pos fingers collide?
					})
					.then(() => {
						fingers[this.next] = correct_finger;
					});
			}
		}
	}
	// find_successor(id)
	// if n < id <= this.successor:
	// 	return this.successor
	// else:
	// 	n’ = closest_preceding_node(id)
	// return send_rpc(FIND_SUCCESSOR, n’, id)

	find_successor(id) {
		return new Promise((resolve, reject) => {
			let id_mod = (id - this.own_id) % 4 ** m;
			successor_mod = (this.successor - this.own_id) % 4 ** m;
			if (id_mod <= successor_mod) {
				resolve(this.successor);
			} else {
				consult = closest_preceding_node(id);
				this.functions
					.send_rpc(consult, {
						type: "FIND_SUCCESSOR",
						content: id.toString(),
					})
					.then((p) => {
						p = BigInt(p);
						resolve(p);
					});
			}
		});
	}
	// closest_preceding_node(id)
	// for i = m downto 1:
	// 	if this.own_id < finger[i] < id:
	// 		return finger[i]
	// return this.own_id
	closest_preceding_node(id) {
		let id_mod = (id - this.own_id) % 4n ** m;
		let i;
		for (i = Number(m); i >= 1; i--) {
			finger_mod = (finger[i] - this.own_id) % 4n ** m;
			if (finger_mod <= id_mod) {
				return finger[i];
			}
		}
		return this.own_id;
	}
}

module.exports = function (bits = 64n) {
	m = bits;
	return ChordNode;
};
