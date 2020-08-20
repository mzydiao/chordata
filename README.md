# chordata

## Overview

**chordata** is a protocol for bidirectional peer-to-peer networking based on the [Chord](https://pdos.csail.mit.edu/papers/ton:chord/paper-ton.pdf) algorithm. It maintains a self-correcting graph of connections between *n* peers with the following properties:

| Property | Expected | Worst case |
| --- | :---: | :---: |
| Degree | log<sub>2</sub> n | m - 1 |
| Diameter | log<sub>4</sub>  n | log<sub>4/3</sub> n |

Here, *m* denotes the base-4 logarithm of the key space.

## Details

**chordata** constructs and maintains its graph of peers in the following way:
* All peers are given a unique hash generated uniformly at random from the space of all 2m-bit integers.
* All peers keep track of a *successor* and *predecessor* that they are connected to. In the steady state, all pairs of adjacent keys modulo `4 ** m` form a successor/predecessor pair.
* In addition, all peers maintain a *finger table* of keys, which serves as a list of additional nodes to maintain connections to. The finger table is constructed by connecting to `successor(k + 4 ** j)` for `1 <= j <= m`.[^1]
* While connected, peers periodically run functions `notify`, `stabilize` and `fix_fingers`, which serve to correct the graph in case of new connections or disconnections.

[^1]: Given a 2m-bit integer `i` and a list of keys `K`, we define the *successor* of `i` as the key `k` in `K` such that `(k - i) % 4**m` is minimal.

## Methods

## Demo

<center>
![The graph self-stablizes after the introduction of new peers.](./figs/chord-fingers.gif)
</center>
