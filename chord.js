let m = 64n;

class ChordNode {
	constructor(hash, funcs, { stabilizeInterval, fixFingersInterval }) {
		this.own_id = hash;
		this.predecessor = null;
		//m is the power of 4
		//keep bigint in mind
		//encode bigint as hex; decode when handle rpc
		this.next = 1n;
		this.functions = funcs;
		//includes connect, disconnect, isConnected, hasConnection, send_rpc,
		//query_successors

		this.fingers = Array(Number(m)).fill(null);

		setInterval(() => {
			this.stabilize();
		}, stabilizeInterval);
		setInterval(() => {
			this.fix_fingers();
		}, fixFingersInterval);
	}

	// create()
	// this.successor = this.own_id
	create() {
		this.fingers[0] = null; //this.own_id;
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
		this.fingers[0] = id;
		this.functions.connect(this.fingers[0]).then(() => {
			this.notify(this.fingers[0]);
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
		if (this.fingers[0] === null) {
			return;
		}
		this.functions
			.send_rpc(this.fingers[0], {
				type: "GET_PREDECESSOR",
			})
			.then((ps) => {
				if (!ps) return;
				ps = BigInt(ps);
				if (this.between(this.own_id, ps, this.fingers[0])) {
					let old_successor = this.fingers[0];
					if (!this.functions.hasConnection(ps)) {
						this.functions.connect(ps);
					} else if (this.functions.isConnected(ps)) {
						this.fingers[0] = ps;
						if (old_successor !== this.predecessor) {
							if (!this.fingers.includes(old_successor))
								this.functions.disconnect(old_successor);
							// might need to think about this again for reverse fingers
						}
					}
				}
			});
		this.notify(this.fingers[0]);
	}

	between(a, b, c) {
		if (a < c) {
			return a < b && b < c;
		}
		return a < b || b < c;
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
				if (this.fingers[0] === null) {
					this.fingers[0] = sender;
				}
				if (
					this.between(this.predecessor, sender, this.own_id) ||
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
				let find_id = BigInt(data.content);
				this.find_successor(find_id).then((answer) => {
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
		} else if (id == this.fingers[0]) {
			let successorList = this.functions.query_successors().then(() => {
				successorIndex = 0;
				if (this.fingers[0] == null) {
					throw "no this.fingers[0]";
				}
				let connected = false;
				let attemptConnection = () => {
					this.functions
						.connect(this.fingers[0])
						.then(() => {
							connected = true;
						})
						.catch(() => {
							//do nothing
							successorIndex = successorIndex + 1;
							// 	if no this.next this.successor, throw error, break
							if (successorIndex >= successorList.length) {
								throw "no this.fingers[0]"; //deal with this later
							}
							this.fingers[0] = successorList[successorIndex];
							attemptConnection();
						});
				};
			});
		}
		this.notify(this.fingers[0]);
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
		if (this.next >= m) {
			this.next = 1n;
		}
		this.find_successor((this.own_id + 4n ** this.next) % 4n ** m)
			.then((correct_finger) => {
				correct_finger = BigInt(correct_finger);
				if (correct_finger === this.own_id) return;

				if (this.fingers[this.next] != correct_finger) {
					let old_finger = this.fingers[this.next];
					this.fingers[this.next] = correct_finger;

					// might need to care about edge case where neg
					// and pos fingers collide?
					if (
						old_finger !== null &&
						!this.fingers.includes(old_finger)
					) {
						this.functions.disconnect(old_finger);
					}

					if (!this.functions.hasConnection(correct_finger))
						this.functions.connect(correct_finger).then(() => {});
				} else if (!this.functions.hasConnection(correct_finger)) {
					this.functions.connect(correct_finger);
				}
			})
			.catch((error) => {
				console.error(error);
			});
	}
	// find_successor(id)
	// if n < id <= this.successor:
	// 	return this.successor
	// else:
	// 	n’ = closest_preceding_node(id)
	// return send_rpc(FIND_SUCCESSOR, n’, id)

	find_successor(id) {
		return new Promise((resolve, reject) => {
			if (this.fingers[0] === null) {
				reject();
				return;
			}
			if (this.between(this.own_id, id, this.fingers[0] + 1n))
				resolve(this.fingers[0]);
			else {
				let consult = this.closest_preceding_node(id);
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
		for (let i = Number(m) - 1; i >= 0; i--) {
			if (this.fingers[i] === null) continue;

			if (this.between(this.own_id, this.fingers[i], id))
				return this.fingers[i];
		}
		return this.own_id;
	}
}

module.exports = function (bits = 64n) {
	m = BigInt(bits);
	return ChordNode;
};
