class Message {
    constructor(originator, msgId) {
        // identifiers of nodes who have sent receipts
        this.receipts = new Set();
        // nodeId -> resolution handler
        this.resolutionHandlers = new Map();
    }

    setReceipt(node) {
        this.receipts.add(node);
    }

    hasReceipt(node) {
        return this.receipts.has(node);
    }

    setResolutionHandler(node, callback) {
        this.resolutionHandlers.set(node, callback);
    }

    resolveHandler(node) {
        if (this.resolutionHandlers.has(node))
            this.resolutionHandlers.get(node)();
    }
}

/**
 * Tracks messages and receipts
 */
class MessageTracker {
    constructor() {
        // key: originator's hash.
        // val: object containing:
        // ---- index. (index for which all < i are present)
        // ---- buffer. (messages present that are >= i)
        // ---- messages. Map: id (index) -> Message
        this.tracker = new Map();
        // "originator,msgId" -> Message
        this.messages = new Map();
        this.nextSendId = 0;
    }

    /**
     * Adds an originator to this.tracker
     *
     * @param {String} orig identifier of the message originator
     */
    addOrigToTracker(orig) {
        let trackObject = {
            index: 0,
            buffer: [],
        };
        this.tracker.set(orig, trackObject);
    }

    hasReceipt(originator, msgId, node) {
        return (
            this.hasMessage(originator, msgId) &&
            this.getMessage(originator, msgId).hasReceipt(node)
        );
    }

    hasMessage(originator, msgId) {
        return this.messages.has(`${originator},${msgId}`);
    }

    /**
     * Get message for a given originator-msgId pair.
     *
     * @param {String} originator originator of the message
     * @param {int} msgId id of the message from originator
     * @returns {Message} message object
     */
    getMessage(originator, msgId) {
        return this.messages.get(`${originator},${msgId}`);
    }

    createMessage(originator, msgId) {
        this.messages.set(
            `${originator},${msgId}`,
            new Message(originator, msgId)
        );
    }

    hasReceipt(originator, msgId, node) {
        return (
            this.hasMessage(originator, msgId) &&
            this.getMessage(originator, msgId).hasReceipt(node)
        );
    }

    sentMessage(originator, msgId, node, callback) {
        if (!this.hasMessage(originator, msgId))
            this.createMessage(originator, msgId);
        this.getMessage(originator, msgId).setResolutionHandler(node, callback);
    }

    handleReceipt(originator, msgId, node) {
        if (this.hasMessage(originator, msgId))
            this.getMessage(originator, msgId).resolveHandler(node);
        else this.createMessage(originator, msgId);
        this.getMessage(originator, msgId).setReceipt(node);
    }

    receiveMessage(originator, msgId) {
        // check if have seen before; if yes, send a receipt back to original
        // sender
        if (!this.tracker.has(originator)) {
            this.addOrigToTracker(originator);
        }
        let trackerOriginator = this.tracker.get(originator);

        if (
            msgId < trackerOriginator.index ||
            trackerOriginator.buffer.includes(msgId)
        ) {
            return false;
        }

        // if have not seen before, update buffer and index, broadcast packet
        if (msgId == trackerOriginator.index) {
            // message arrived in order
            trackerOriginator.index++;

            // if caught up to buffered messages, empty buffer in order
            while (trackerOriginator.index == trackerOriginator.buffer[0]) {
                trackerOriginator.buffer.shift();
                trackerOriginator.index++;
            }
        } else {
            // message arrived out of order
            trackerOriginator.buffer.push(msgId);
            trackerOriginator.buffer.sort((a, b) => a - b);
        }

        return true;
    }
}

module.exports = MessageTracker;
