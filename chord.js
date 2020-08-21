const jsbi = require("jsbi");

// m stores log4 (max identifier + 1)
let m = jsbi.BigInt(64);

class ChordNode {
    /**
     * Creates an instance of ChordNode.
     *
     * @constructor
     * @param {String} hash node identifier of the ChordNode in hexadecimal
     * @param {object} funcs object containing callback functions `connect`,
     * `disconnect`, `isConnected`, `hasConnection`, `send_rpc`,
     * `query_successors`
     * @param {object} options object containing options for
     * `stabilizeInterval` and `fixFingersInterval`
     */
    constructor(hash, funcs, { stabilizeInterval, fixFingersInterval }) {
        this.own_id = hash;
        this.functions = funcs;

        this.predecessor = null;
        this.tempSuccessor = null;
        // array of m fingers stored as hex strings; this.fingers[0] is the
        // successor
        this.fingers = Array(Number(m)).fill(null);
        // index of finger to be fixed, start at 1 (0 is the successor)
        this.next = 1;

        // set intervals to run stabilize and fixFingers
        this.stabilizeHandle = setInterval(() => {
            this.stabilize();
        }, stabilizeInterval);
        this.fixFingersHandle = setInterval(() => {
            this.fix_fingers();
        }, fixFingersInterval);
    }

    /**
     * Destroys ChordNode.
     */
    destroy() {
        clearInterval(this.stabilizeHandle);
        clearInterval(this.fixFingersHandle);
    }

    /**
     * Creates a new network with this as the first member.
     */
    create() {
        this.fingers[0] = null; // not necessary
    }

    /**
     * Checks if node b is between node a and node c (i.e., a -> b -> c).
     *
     * @param {String} a node identifier a, hex
     * @param {String} b node identifier b, hex
     * @param {String} c node identifier c, hex
     * @returns {boolean} whether or not b is beteen a and c
     */
    between(a, b, c) {
        a = jsbi.BigInt(`0x${a}`);
        b = jsbi.BigInt(`0x${b}`);
        c = jsbi.BigInt(`0x${c}`);
        if (jsbi.lessThan(a, c)) {
            return jsbi.lessThan(a, b) && jsbi.lessThan(b, c);
        }
        return jsbi.lessThan(a, b) || jsbi.lessThan(b, c);
    }

    /**
     * Notifies a node of this node's existence.
     *
     * @param {String} id identifier of node to be notified, hex string
     */
    notify(id) {
        this.functions
            .send_rpc(id, {
                type: "NOTIFY",
            })
            .catch((err) => {
                // if node id can't be notified, do nothing
                console.error("notify", err);
            });
    }

    /**
     * Joins an existing network.
     *
     * @param {String} id identifier of this node's successor in the network,
     * hex string
     */
    join(id) {
        this.fingers[0] = id;
        this.functions.connect(this.fingers[0]).then(() => {
            this.notify(this.fingers[0]);
        }); // TODO: handle error in connect promise?
    }

    /**
     * Runs stabilization algorithm to maintain correct successor.
     */
    stabilize() {
        // if there is not yet a successor to query, do nothing (e.g. right
        // after calling create())
        if (this.fingers[0] === null) return;

        this.functions
            // ask successor who its predecessor is
            .send_rpc(this.fingers[0], {
                type: "GET_PREDECESSOR",
            })
            .then((ps) => {
                // if successor does not have a predecessor, do nothing
                if (!ps) return;

                if (this.between(this.own_id, ps, this.fingers[0])) {
                    // if successor's predecessor (ps) is between this node and
                    // the successor, should switch successor to ps
                    let old_successor = this.fingers[0];

                    if (!this.functions.hasConnection(ps)) {
                        // if not already connected to ps, attempt connection
                        this.functions.connect(ps);
                        this.tempSuccessor = ps;
                    } else if (this.functions.isConnected(ps)) {
                        // already connected to ps, so set successor to ps and
                        // disconnect from the old successor
                        this.fingers[0] = ps;
                        this.tempSuccessor = null;

                        // do not disconnect from a node if it is also the
                        // predecessor, or it is still somewhere else in the
                        // finger table
                        if (
                            old_successor !== this.predecessor &&
                            !this.fingers.includes(old_successor)
                        ) {
                            this.functions.disconnect(old_successor);
                            // TODO: might need to think about this again for
                            // reverse fingers
                        }
                    }
                }
            })
            .catch((err) => {
                // if couldn't get ps from successor, do nothing
                console.error("stabilize", err);
            });

        // finally, attempt to notify the successor
        this.notify(this.fingers[0]);
    }

    /**
     * Respond to RPCs from other nodes.
     *
     * @param {String} sender identifer of the sender of the RPC, hex
     * @param {object} data
     * @param {function} resolve_rpc callback to return response to the sender
     */
    handle_rpc(sender, data, resolve_rpc) {
        switch (data.type) {
            case "NOTIFY":
                // after node a calls create(), when the second node b joins,
                // a.successor is null; b notifies a, and a should set b to be
                // both predecessor and successor
                if (this.fingers[0] === null) this.fingers[0] = sender;

                // set sender to be the predecessor if between current
                // predecessor and this node, or if predecessor has not yet
                // been set
                if (
                    this.predecessor === null ||
                    this.between(this.predecessor, sender, this.own_id)
                )
                    this.predecessor = sender;

                resolve_rpc(null);
                break;

            case "GET_PREDECESSOR":
                resolve_rpc(this.predecessor);
                break;

            case "FIND_SUCCESSOR":
                // data.content contains target identifier as hex string
                this.find_successor(data.content).then((answer) => {
                    resolve_rpc(answer);
                }); // TODO: handle error in finding successor?
                break;

            default:
                return;
        }
    }

    /**
     * Handle the event where a node got disconnected.
     *
     * @param {String} id identifier of node that got disconnected, hex
     */
    on_disconnect(id) {
        if (id == this.predecessor) this.predecessor = null;
        if (id == this.fingers[0]) {
            // if disconnected from successor, call query_successors to obtain
            // list of potential successors and attempt to connect in order

            if (this.tempSuccessor !== null) {
                // if disconnected from successor in middle of stabilizing to a
                // new successor (tempSuccessor), give up on stabilization and
                // disconnect from tempSuccessor
                this.functions.disconnect(this.tempSuccessor).catch((err) => {
                    console.error(err);
                });
            }

            this.functions.query_successors().then((successorList) => {
                if (successorList.length === 0) {
                    // no successors, so set successor to null to enable
                    // re-establishment of graph
                    this.fingers[0] = null;
                    return;
                }

                // index of successor to contact on successorlist
                let successorIndex = 0;
                let attemptConnection = () => {
                    this.fingers[0] = successorList[successorIndex];
                    // attempt to make a connection to potential successor
                    this.functions
                        .connect(this.fingers[0])
                        .then(() => {
                            // if successfully connected, notify successor
                            this.notify(this.fingers[0]);
                        })
                        .catch(() => {
                            // if connection failed, advance the successor
                            // index and reattempt connection
                            successorIndex = successorIndex + 1;
                            if (successorIndex >= successorList.length) {
                                // if no more successors on the list, throw an
                                // error; TODO: deal with this
                                throw "no this.fingers[0]";
                            }
                            attemptConnection();
                        });
                };
                attemptConnection();
            });
        }
    }

    /**
     * Runs fixFingers algorithm to maintain correct finger table.
     */
    fix_fingers() {
        // fix the next finger; restart next at 1 (not 0) because
        // this.fingers[0] is the successor, which is maintained by stabilize
        this.next = this.next + 1;
        if (this.next >= Number(m)) {
            this.next = 1;
        }

        // calculate the id and find its successor
        let id = jsbi.remainder(
            jsbi.add(
                jsbi.BigInt(`0x${this.own_id}`),
                jsbi.exponentiate(jsbi.BigInt(4), jsbi.BigInt(this.next))
            ),
            jsbi.exponentiate(jsbi.BigInt(4), m)
        );
        this.find_successor(id.toString(16))
            .then((correct_finger) => {
                // no point in having this node as its own finger
                if (correct_finger === this.own_id) return;

                if (this.fingers[this.next] != correct_finger) {
                    // if the correct finger is different from the stored
                    // identifier in the finger table, update the finger table
                    let old_finger = this.fingers[this.next];
                    this.fingers[this.next] = correct_finger;

                    // do not disconnect from a finger if it is still somewhere
                    // else in the table; TODO: might need to care about edge
                    // case where neg and pos fingers collide?
                    if (
                        old_finger !== null &&
                        !this.fingers.includes(old_finger)
                    ) {
                        this.functions.disconnect(old_finger).catch((err) => {
                            console.error(err);
                        });
                    }

                    // if not already connected to the new finger, attempt
                    // connection
                    if (!this.functions.hasConnection(correct_finger))
                        this.functions.connect(correct_finger).catch((err) => {
                            console.error(err);
                        });
                } else if (!this.functions.hasConnection(correct_finger)) {
                    // if the finger table does not have to be changed, but for
                    // some reason not currently connected to the correct
                    // finger, attempt connection
                    this.functions.connect(correct_finger).catch((err) => {
                        console.error(err);
                    });
                }
            })
            .catch((error) => {
                // if successor couldn't be found, this finger can't be fixed
                // at the moment, so do nothing
                console.error(error);
            });
    }

    /**
     * Finds the successor of a given identifier (i.e., the smallest node in
     * the network whose identifier >= the target)
     *
     * @param {String} id identifier to find the successor of, hex
     * @returns {Promise<String>} promise that resolves with identifier of
     * successor, hex
     */
    find_successor(id) {
        return new Promise((resolve, reject) => {
            if (this.fingers[0] === null) {
                reject("no successor");
                return;
            }

            if (
                this.between(this.own_id, id, this.fingers[0]) ||
                id === this.fingers[0]
            )
                // if id is between this node and the successor, then the
                // successor must be the successor of id, since there are no
                // nodes between this node and the successor
                resolve(this.fingers[0]);
            else {
                // find the largest nodes in the finger table that precede id,
                // in descending order (contact the largest/best finger first)
                const consultList = this.closest_preceding_node(id);
                const ask = () => {
                    if (consultList.length === 0) {
                        // if there are no more fingers in the list, give up
                        reject("could not contact preceding nodes");
                        return;
                    }

                    // get first finger in the list to contact
                    const consult = consultList.shift();
                    this.functions
                        .send_rpc(consult, {
                            type: "FIND_SUCCESSOR",
                            // encode target id as string
                            content: id.toString(),
                        })
                        .then((p) => {
                            // if consult successfully found the successor,
                            // resolve with the returned successor
                            resolve(p);
                        })
                        .catch((err) => {
                            // could not contact consult, so retry with next
                            // finger in consultList
                            console.error("find successor", err);
                            ask();
                        });
                };

                ask();
            }
        });
    }

    /**
     * Finds the closest preceding nodes in the finger table of a given
     * identifier, in descending order, starting from the closest preceding
     * node.
     *
     * @param {String} id identifer to find the closest preceding nodes of, hex
     * @returns {Array<String>} list of closest preceding nodes in finger
     * table, hex
     */
    closest_preceding_node(id) {
        const consult = [];
        for (let i = Number(m) - 1; i >= 0; i--) {
            // starting from the largest finger, add fingers that are between
            // this node and id
            if (this.fingers[i] === null) continue;
            if (this.between(this.own_id, this.fingers[i], id))
                consult.push(this.fingers[i]);
        }
        return consult;
    }
}

module.exports = function (bits = 64) {
    m = jsbi.BigInt(bits);
    return ChordNode;
};
