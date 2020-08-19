const m = 4;
const ChordNode = require("./chord")(m);

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
		if (i == 0) {
			newGuy.create();
		} else {
			funcs.query_successors().then((succs) => {
				let connectTo = succs[0];
				newGuy.join(connectTo);
			});
		}
	}
}

function genHash() {
	let currString = "0x";
	let convertHex = "0123456789abcdef";
	for (let i = 0; i < m; i++) {
		let rand = Math.floor(Math.random() * 16);
		currString = currString + convertHex.substring(rand, rand + 1);
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
			resolve();
		});
	};
	let disconnect = (id) => {
		return new Promise((resolve, reject) => {
			neighbors.get(hash).delete(id);
			neighbors.get(id).delete(hash);
			resolve();
		});
	};
	let isConnected = (id) => {
		return neighbors.get(hash).has(id);
	};
	let hasConnection = (id) => {
		return neighbors.get(hash).has(id);
		//maybe implement connection delay later
	};
	let send_rpc = (id, data) => {
		return new Promise((resolve, reject) => {
			nodes.get(id).handle_rpc(hash, data, resolve);
		});
	};
	let query_successors = () => {
		return new Promise((resolve, reject) => {
			let allHashes = Array.from(nodes.keys());
			allHashes.sort((a, b) => {
				if (a < b) return -1;
				else if (a > b) return 1;
				return 0;
			});

			let rotateIndex = allHashes.indexOf(hash);
			let rotated = allHashes
				.slice(rotateIndex + 1, allHashes.length)
				.concat(allHashes.slice(0, rotateIndex));
			resolve(rotated);
		});
	};
	return {
		connect,
		disconnect,
		isConnected,
		hasConnection,
		send_rpc,
		query_successors,
	};
}

function jsonify(map) {
	let obj = {};
	map.forEach((v, k, m) => {
		obj[k] = Array.from(v).map((bigint) => bigint.toString());
	});
	return JSON.stringify(obj);
}

simulate(20);
const fs = require("fs");
setTimeout(() => {
	const json = jsonify(neighbors);
	console.log(json);
	fs.writeFile("data.json", json, (err) => {
		console.error(err);
	});
}, 1000);
