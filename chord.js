let own_id;
let successor;
let predecessor;
//m is the power of 4
let m = 64n;
//keep bigint in mind
//encode bigint as hex; decode when handle rpc
let next = 1n;
let functions;
//includes connect, disconnect, isConnected, hasConnection, send_rpc,
//query_successors

export function initialize(hash, funcs) {
    own_id = hash;
    functions = funcs;
}

// create()
// successor = own_id
export function create() {
    successor = own_id;
}

// notify(n)
// send_rpc(NOTIFY, n) // calls peer.send()
export function notify(id) {
    functions.send_rpc(id, {
        type: "NOTIFY",
    }); //?
}

// join(id) // id is guaranteed to be successor based on server
// successor = id
// peer.connect(successor)
// notify(successor)
export function join(id) {
    successor = id;
    functions.connect(successor).then(() => {
        notify(successor);
    });
}
// stabilize()
// p’ = send_rpc(GET_PREDECESSOR, successor)
// if own_id < p’ < successor || (p > s && (p’ > p || p’ < s)):
// 	if !peer.hasConnection(p’):
// 		peer.connect(p’)
// 	else if peer.getConnection(p’).connected == true:
// 		old_successor, successor = successor, p’
// peer.disconnect(old_successor)
// notify(successor)
export function stabilize() {
    //predecessor of successor

    functions
        .send_rpc(successor, {
            type: "GET_PREDECESSOR",
        })
        .then((ps) => {
            ps = BigInt(ps);
            if (
                (own_id < ps && ps < successor) ||
                (own_id > successor && (ps > own_id || ps < successor))
            ) {
                let old_successor = successor;
                if (!functions.hasConnection(ps)) {
                    functions.connect(ps);
                } else if (functions.isConnected(ps)) {
                    successor = ps;
                    functions.disconnect(old_successor);
                }
            }
        });
    notify(successor);
}

// handle_rpc(type, sender)
// switch type:
// case NOTIFY:
// 		if predecessor < sender < own_id:
// 			predecessor = sender
// 	case GET_PREDECESSOR:
// 		respond_rpc(predecessor)
export function handle_rpc(sender, data, resolve_rpc) {
    //sender is a BigInt
    switch (data.type) {
        case "NOTIFY":
            if (predecessor < sender && sender < own_id) {
                predecessor = sender;
            }
            resolve_rpc(null);
        case "GET_PREDECESSOR":
            resolve_rpc(predecessor.toString());
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
// if id == predecessor:
// 	predecessor = null
// else if id == successor:
// 	successor_list = query_server_for_successors(2 minutes) // then:
// 	connected = false
// 	while !connected: // reattempt current successor, then loop list
// 		peer.connect(successor) // then:
// 		success:
// 			connected = true
// 		failure:
// 	successor = successor_list.next(successor)
// 	if no next successor, throw error, break
// 	notify(successor)
export function on_disconnect(id) {
    if (id == predecessor) {
        predecessor = null;
    } else if (id == successor) {
        let successorList = functions.query_successors().then(() => {
            successorIndex = 0;
            if (successor == null) {
                throw "no successor";
            }
            let connected = false;
            let attemptConnection = () => {
                functions
                    .connect(successor)
                    .then(() => {
                        connected = true;
                    })
                    .catch(() => {
                        //do nothing
                        successorIndex = successorIndex + 1;
                        // 	if no next successor, throw error, break
                        if (successorIndex >= successorList.length) {
                            throw "no successor"; //deal with this later
                        }
                        successor = successorList[successorIndex];
                        attemptConnection();
                    });
            };
        });
    }
    notify(successor);
}
// fix_fingers(next)
// next = next + 1
// if next > m:
// 	next = 1
// correct_finger = find_successor(own_id + 4^(next-1))
// if fingers[next] != correct_finger:
// 	if !peer.hasConnection(correct_finger):
// 		peer.connect(correct_finger)
// 		peer.disconnect(fingers[next])
// 	fingers[next] = correct_finger
// initialize next to 1n
export function fix_fingers() {
    next = next + 1n;
    if (next > m) {
        next = 1n;
    }
    correct_finger = find_successor(own_id + 4n ** (next - 1n));
    if (fingers[next] != correct_finger) {
        if (!functions.hasConnection(correct_finger)) {
            functions
                .connect(correct_finger)
                .then(() => {
                    return functions.disconnect(fingers[next]);
                    //might need to care about edge case where neg
                    //and pos fingers collide?
                })
                .then(() => {
                    fingers[next] = correct_finger;
                });
        }
    }
}
// find_successor(id)
// if n < id <= successor:
// 	return successor
// else:
// 	n’ = closest_preceding_node(id)
// return send_rpc(FIND_SUCCESSOR, n’, id)

export function find_successor(id) {
    return new Promise((resolve, reject) => {
        let id_mod = (id - own_id) % 4 ** m;
        successor_mod = (successor - own_id) % 4 ** m;
        if (id_mod <= successor_mod) {
            resolve(successor);
        } else {
            consult = closest_preceding_node(id);
            functions
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
// 	if own_id < finger[i] < id:
// 		return finger[i]
// return own_id
export function closest_preceding_node(id) {
    let id_mod = (id - own_id) % 4n ** m;
    let i;
    for (i = Number(m); i >= 1; i--) {
        finger_mod = (finger[i] - own_id) % 4n ** m;
        if (finger_mod <= id_mod) {
            return finger[i];
        }
    }
    return own_id;
}
