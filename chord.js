const jsbi = require("jsbi");
const SortedList = require("sortedlist");
const EventEmitter = require("events").EventEmitter;
const MessageTracker = require("./messageTracker");

// m stores log4 (max identifier + 1)
let m = jsbi.BigInt(64);

function createSortedList(initial = []) {
    return SortedList.create(
        {
            compare: (a, b) => {
                a = jsbi.BigInt(`0x${a}`);
                b = jsbi.BigInt(`0x${b}`);
                if (jsbi.lessThan(a, b)) return -1;
                else if (jsbi.greaterThan(a, b)) return 1;
                return 0;
            },
        },
        initial
    );
}

class ChordNode extends EventEmitter {
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
    constructor(
        hash,
        funcs,
        {
            stabilizeInterval,
            fixFingersInterval,
            trackNodeList,
            messageResendInterval = 1000,
            messageResendCount = 5,
        }
    ) {
        super();
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

        // maintain list of all nodes in chord? used for information purposes,
        // not for actual chord maintenance
        this.trackNodeList = trackNodeList;
        this.nodeList = null;

        this.tracker = new MessageTracker();

        // Map: dest id -> MessageTracker;
        this.directedTracker = new Map();
        this.messageResendInterval = messageResendInterval;
        this.messageResendCount = messageResendCount;

        this.on("data", (src, data) => this.handleData(src, data));
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
        if (this.trackNodeList) {
            this.nodeList = createSortedList([this.own_id]);
        }
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
     * Returns the distance in key space between ids a, b
     * @param {String} a node idenfitier a, hex
     * @param {String} b node identifier b, hex
     * @returns {BigInt} distance
     */
    distance(a, b) {
        a = jsbi.BigInt(`0x${a}`);
        b = jsbi.BigInt(`0x${b}`);

        let exp = jsbi.exponentiate(jsbi.BigInt(4), m);
        let posDist = jsbi.remainder(jsbi.add(jsbi.subtract(a, b), exp), exp);
        console.log("posDist", posDist.toString());

        let negDist = jsbi.remainder(jsbi.add(jsbi.subtract(b, a), exp), exp);
        console.log("negDist", negDist.toString());

        if (jsbi.lessThan(posDist, negDist)) {
            return posDist;
        }
        return negDist;
    }

    /**
     * Notifies a node of this node's existence.
     *
     * @param {String} id identifier of node to be notified, hex string
     */
    notify(id) {
        let message = {
            type: "NOTIFY",
        };
        if (this.trackNodeList && this.nodeList !== null)
            // don't send nodeList until node list is non-null; wait until
            // notified by predecessor
            message.nodeList = this.nodeList;

        this.functions.send_rpc(id, message).catch((err) => {
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
                        this.functions.connect(ps).then(() => {
                            this.stabilize();
                        });
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

                        this.stabilize();
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
                if (this.fingers[0] === null) {
                    this.fingers[0] = sender;
                    this.notify(this.fingers[0]);
                }

                // set sender to be the predecessor if between current
                // predecessor and this node, or if predecessor has not yet
                // been set
                if (
                    this.predecessor === null ||
                    this.between(this.predecessor, sender, this.own_id)
                ) {
                    let oldPredecessor = this.predecessor;
                    this.predecessor = sender;
                    if (oldPredecessor)
                        this.functions.send_rpc(oldPredecessor, {
                            type: "UPDATE",
                        });
                }

                if (
                    this.predecessor === sender &&
                    this.trackNodeList &&
                    data.nodeList
                )
                    this.updateNodeList(createSortedList(data.nodeList));

                resolve_rpc(null);
                break;

            case "GET_PREDECESSOR":
                resolve_rpc(this.predecessor);
                break;

            case "UPDATE":
                resolve_rpc(null);
                this.stabilize();
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
     * Updates the node list if trackNodeList is true; sends update info to
     * other nodes
     *
     * @param {SortedList} list updated node list from predecessor
     */
    updateNodeList(list) {
        // lists of ids added or removed
        let add = [];
        let remove = [];
        if (list.key(this.predecessor) === null)
            throw (
                "new node list does not include predecessor " + this.predecessor
            );

        if (list.key(this.own_id) === null) {
            // if list does not contain own id, add own id and announce it
            add.push(this.own_id);
            list.insertOne(this.own_id);
        }

        // find indices
        let ownIndex = list.key(this.own_id);
        let predIndex = list.key(this.predecessor);
        // rotate list to begin with predecessor
        list = list.slice(predIndex).concat(list.slice(0, predIndex));
        // recalculate ownIndex
        ownIndex =
            ownIndex > predIndex
                ? ownIndex - predIndex
                : list.length - predIndex + ownIndex;

        // remove any values between predecessor and this node in the list
        this.nodeList = createSortedList(
            [this.predecessor].concat(list.slice(ownIndex))
        );
        // announce removed ids
        remove = list.slice(1, ownIndex);
        if (add.length > 0 || remove.length > 0)
            this.broadcast({
                type: "NL",
                add: add,
                remove: remove,
            });
        this.emit("nodeList", add, remove);
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
                    if (this.trackNodeList) {
                        // emit event removing all other ids
                        this.emit(
                            "nodeList",
                            [],
                            this.nodeList.filter((id) => id !== this.own_id)
                        );
                        // reset node list to this node only
                        this.nodeList = createSortedList([this.own_id]);
                    }
                    return;
                }

                // index of successor to contact on successorlist
                let successorIndex = 0;
                let attemptConnection = () => {
                    this.fingers[0] = successorList[successorIndex];
                    if (this.functions.hasConnection(this.fingers[0])) {
                        // already have connection to new successor, so just
                        // notify them
                        this.notify(this.fingers[0]);
                        return;
                    }

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

    handleData(src, data) {
        if (this.trackNodeList) {
            if (data.type === "NL") {
                // handle broadcasts with node list updates
                if (this.nodeList === null) return;
                let { add, remove } = data;
                for (let a of add) {
                    if (this.nodeList.key(a) === null)
                        this.nodeList.insertOne(a);
                }
                for (let r of remove) {
                    let key = this.nodeList.key(r);
                    if (key !== null) this.nodeList.remove(key);
                }
                this.emit("nodeList", add, remove);
            }
        }
    }

    /**
     * Sends data to the rest of the graph.
     *
     * @param {object} data data to broadcast to the rest of the graph
     */
    broadcast(data) {
        let packet = {
            originator: this.own_id,
            id: this.tracker.nextSendId,
            type: "PACKET",
            content: data,
        };
        this.tracker.nextSendId++;
        return this.relay(packet);
    }

    /**
     * keep broadcasting to fingers who haven't seen until receipt
     *
     * @param {object} data data to send
     * @returns {Promise} resolves when all adjacent nodes have sent receipt
     */
    relay(data, sender) {
        // query for neighbors
        let neighbors = this.functions.getNeighbors();

        let originator = data.originator;
        let msgId = data.id;

        if (originator === undefined || msgId === undefined) {
            console.log("broadcast: originator or msgId is undefined!");
        }

        let promises = [];
        for (let neigh of neighbors) {
            if (this.tracker.hasReceipt(originator, msgId, neigh)) {
                continue;
            }
            if (neigh === sender) continue;

            promises.push(this.sendToNode(neigh, data));
        }

        return Promise.all(promises)
            .catch(() => {})
            .then(() => {
                this.tracker.deleteMessage(originator, msgId);
            });
    }

    sendToClosestNeighbor(nodeId, data, sender) {
        // query for neighbors
        let neighbors = this.functions.getNeighbors();

        let currMinDist;
        let currMinNeigh;

        for (let neigh of neighbors) {
            let dist = this.distance(neigh, nodeId);
            if (currMinDist === undefined || jsbi.lessThan(dist, currMinDist)) {
                currMinDist = dist;
                currMinNeigh = neigh;
            }
        }

        if (currMinNeigh === sender)
            return Promise.reject("sender is closest node");
        return this.sendToNode(currMinNeigh, data).then(() => {
            this.directedTracker
                .get(data.destination)
                .deleteMessage(data.originator, data.id);
        });
    }

    /**
     *
     * @param {String} nodeId
     * @param {object} data
     * @returns {Promise} resolves when get receipt from next person
     */
    directedSend(nodeId, data) {
        if (!this.directedTracker.has(nodeId)) {
            this.directedTracker.set(nodeId, new MessageTracker());
        }
        let packet = {
            originator: this.own_id,
            destination: nodeId,
            id: this.directedTracker.get(nodeId).nextSendId,
            type: "DIRECTED",
            content: data,
        };
        this.directedTracker.get(nodeId).nextSendId++;
        return this.sendToClosestNeighbor(nodeId, packet, this.own_id);
    }

    /**
     * keep trying to send to a certain peer until you have a receipt.
     *
     * @param {String} nodeId
     * @param {object} data
     * @returns {Promise} resolves when node nodeId returns receipt
     */
    sendToNode(nodeId, data) {
        // TODO: additional arguments: timeout, waiting period before sending another copy
        return new Promise((resolve, reject) => {
            let originator = data.originator;
            let msgId = data.id;

            if (originator === undefined || msgId === undefined) {
                reject("original or msgId not present in data");
                return;
            }

            if (this.tracker.hasReceipt(originator, msgId, nodeId)) {
                // TODO
                reject("already received!");
                return;
            }

            let counter = 0;
            const sendMessage = () => {
                if (
                    this.functions.hasConnection(nodeId) &&
                    counter < this.messageResendCount
                )
                    this.functions.sendMessage(nodeId, data);
                else {
                    clearInterval(messageIntervalHandle);
                    reject();
                }
                counter++;
            };
            const messageIntervalHandle = setInterval(
                sendMessage,
                this.messageResendInterval
            );
            sendMessage();

            let resolutionHandler = () => {
                clearInterval(messageIntervalHandle);
                resolve();
            };
            let destination = data.destination;

            let currTracker;
            if (destination === undefined) {
                currTracker = this.tracker;
            } else {
                if (!this.directedTracker.has(destination)) {
                    this.directedTracker.set(destination, new MessageTracker());
                }
                currTracker = this.directedTracker.get(destination);
            }
            currTracker.sentMessage(
                originator,
                msgId,
                nodeId,
                resolutionHandler
            );
        });
    }

    /**
     * ignore if have already seen.
     * if not seen before, update buffer and keep trying to send to a individual peer until receipt.
     * @param {object} data
     */
    receive(sender, data) {
        // want to handle receipts but also messages that are supposed to be relayed
        let originator = data.originator;
        let msgId = data.id;
        let destination = data.destination;

        if (originator === undefined || msgId === undefined) {
            return;
        }

        let currTracker;
        let ret;
        let receiptPacket;

        switch (data.type) {
            case "DIRECTED":
                receiptPacket = {
                    type: "DRECEIPT",
                    originator: originator,
                    destination: destination,
                    id: msgId,
                };
                this.functions.sendMessage(sender, receiptPacket);

                if (this.own_id === destination) {
                    if (!this.directedTracker.has(destination)) {
                        this.directedTracker.set(
                            destination,
                            new MessageTracker()
                        );
                    }
                    currTracker = this.directedTracker.get(destination);
                    ret = currTracker.receiveMessage(originator, msgId);
                    if (ret) this.emit("data", originator, data.content);
                } else {
                    //send to closest neighbor
                    // currTracker.handleReceipt(originator, msgId, sender);
                    this.sendToClosestNeighbor(destination, data, sender);
                }
                break;
            case "DRECEIPT":
                destination = data.destination;
                if (!this.directedTracker.has(destination)) {
                    currTracker = new MessageTracker();
                } else {
                    currTracker = this.directedTracker.get(destination);
                }
                currTracker.handleReceipt(originator, msgId, sender);
                break;
            case "RECEIPT":
                this.tracker.handleReceipt(originator, msgId, sender);
                break;
            case "PACKET":
                ret = this.tracker.receiveMessage(originator, msgId);
                receiptPacket = {
                    type: "RECEIPT",
                    originator: originator,
                    id: msgId,
                };
                if (ret) {
                    // broadcast data and send receipts to neighbors
                    this.tracker.handleReceipt(originator, msgId, sender);
                    this.relay(data, sender);

                    let neighbors = this.functions.getNeighbors();
                    for (let neigh of neighbors)
                        this.functions.sendMessage(neigh, receiptPacket);

                    this.emit("data", data.originator, data.content);
                } else {
                    this.functions.sendMessage(sender, receiptPacket);
                }
                break;
            default:
                return;
        }
    }
}

module.exports = function (bits = 64) {
    m = jsbi.BigInt(bits);
    return ChordNode;
};
