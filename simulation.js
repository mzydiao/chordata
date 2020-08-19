const ChordNode = require("./chord")

const m = 64n;
let neighbors;
let nodes;

function simulate(numPeople) {
    //start with a single node
    neighbors = new Map();
    nodes = new Map();

    for (let i = 0; i < numPeople; i++) {
        let hash = BigInt(genHash());
        let funcs = generateFuncs(hash);
        
        neighbors.set(hash, new Set());

        let newGuy = new ChordNode(hash, funcs); //hash, funcs
        nodes.set(hash, newGuy);
        if (i == 0){
            newGuy.create();
        }
        else {
            console.log(funcs.query_successors())
            funcs.query_successors().then((succs) => {
                let connectTo = succs[0]
                newGuy.join(
                    connectTo
                )
            })
        }
    }
}

function genHash() {
    let currString = '0x';
    let convertHex = '0123456789abcdef'
    for (let i = 0; i < m; i++) {
        let rand = Math.floor(Math.random() * 16);
        currString = currString + convertHex.substring(rand, rand+1);
    }
    return currString;
}

//includes connect, disconnect, isConnected, hasConnection, send_rpc,
//query_successors
function generateFuncs(hash) {
    let connect = (id) => {
        return new Promise((resolve, reject) => {
            neighbors.get(hash).add(id);
            neighbors.get(id).add(hash);
        })
    }
    let disconnect = (id) => {
        return new Promise((resolve, reject) => {
            neighbors.get(hash).delete(id);
            neighbors.get(id).delete(hash);
        })
    }
    let isConnected = (id) => {
        return neighbors.get(hash).has(id);
    }
    let hasConnection = (id) => {
        return neighbors.get(hash).has(id);
        //maybe implement connection delay later
    }
    let send_rpc = (id, data) => {
        return new Promise((resolve, reject) => {
            nodes.get(id).handle_rpc(hash, data, resolve);
        })
    }
    let query_successors = () => {
        return new Promise((resolve, reject) => {
            let allHashes = Array.from(nodes.keys());
            allHashes.sort();

            let rotateIndex = allHashes.indexOf(hash);
            resolve(
                allHashes.slice(0,rotateIndex).concat(
                    allHashes.slice(rotateIndex+1, allHashes.length)
                )
            )
        })
    }
    return {
        connect,
        disconnect,
        isConnected,
        hasConnection, 
        send_rpc,
        query_successors,
    }
}

simulate(20);