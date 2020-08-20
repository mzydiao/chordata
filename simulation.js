const m = 8;
const ChordNode = require("./chord")(m);
const fs = require("fs");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let neighbors;
let nodes;

const opts = {
	stabilizeInterval: 1000,
	fixFingersInterval: 1000,
};

async function simulate(numPeople) {
	let object = [];

	//start with a single node
	neighbors = new Map();
	nodes = new Map();

	setInterval(() => {
		const tmp = obj(neighbors);
		if (
			object.length === 0 ||
			JSON.stringify(object[object.length - 1]) != JSON.stringify(tmp)
		) {
			object.push(tmp);
			console.log("list", object.length);
		}
	}, 50);

	let toDisconnect = [];

	for (let i = 0; i < numPeople; i++) {
		console.log(i);
		let hash = BigInt(genHash());
		let funcs = generateFuncs(hash);

		neighbors.set(hash, new Set());
		toDisconnect.push(hash);

		let newGuy = new ChordNode(hash, funcs, opts); //hash, funcs
		nodes.set(hash, newGuy);
		if (i == 0) {
			newGuy.create();
		} else {
			funcs.query_successors().then((succs) => {
				let connectTo = succs[0];
				newGuy.join(connectTo);
			});
		}
		// await sleep(100);
	}

	await sleep(5000);

	console.log("deleting...");
	for (let i = 0; i < 5; i++) {
		let h = toDisconnect.pop();
		console.log(i, h);

		neighbors.get(h).forEach((v, k, s) => {
			neighbors.get(v).delete(h);
			nodes.get(v).on_disconnect(h);
		});
		nodes.get(h).destroy();
		nodes.delete(h);
		neighbors.delete(h);

		// await sleep(100);
	}

	await sleep(35000);

	fs.writeFile("data.json", JSON.stringify(object), (err) => {
		console.error(err);
	});
}

const hashes = [
	"0x3597",
	"0x45e4",
	"0xe8aa",
	"0xbaf5",
	"0x7412",
	"0xd28f",
	"0x10ea",
	"0x9b25",
	"0x7e74",
	"0xffa4",
	"0x4af0",
	"0x5993",
	"0xd63e",
	"0x01ee",
	"0xba6f",
	"0xa035",
	"0x1a68",
	"0x843b",
	"0xeaa3",
	"0xcad4",
];
let hashIndex = 0;

function genHash() {
	/* let currString = "0x";
	let convertHex = "0123456789abcdef";
	for (let i = 0; i < m; i++) {
		let rand = Math.floor(Math.random() * 16);
		currString = currString + convertHex.substring(rand, rand + 1);
    } */
	let currString = hashes[hashIndex];
	hashIndex++;
	return currString;
}

//includes connect, disconnect, isConnected, hasConnection, send_rpc,
//query_successors
function generateFuncs(hash) {
	let connect = (id) => {
		return new Promise((resolve, reject) => {
			if (!neighbors.has(id)) {
				reject("could not connect node " + id);
				return;
			}

			neighbors.get(hash).add(id);
			neighbors.get(id).add(hash);
			resolve();
		});
	};
	let disconnect = (id) => {
		return new Promise((resolve, reject) => {
			if (!neighbors.has(id)) {
				reject("could not disconnect node " + id);
				return;
			}

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
			setTimeout(() => {
				if (!nodes.has(id)) {
					reject("could not contact node " + id);
					return;
				}
				if (!nodes.has(hash)) {
					reject("sender died" + hash);
					return;
				}
				if (!neighbors.get(hash).has(id)) {
					reject("not connected to node " + id);
					return;
				}
				nodes.get(id).handle_rpc(hash, data, resolve);
			}, 100);
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

function obj(map) {
	let obj = {};
	map.forEach((v, k, m) => {
		obj[k] = Array.from(v).map((bigint) => bigint.toString());
	});
	return obj;
}

simulate(20);
/* setTimeout(() => {
	const json = jsonify(neighbors);
	console.log(json);
	fs.writeFile("data.json", json, (err) => {
		console.error(err);
	});
}, 1000);
 */
