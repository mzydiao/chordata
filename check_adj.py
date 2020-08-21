# goal: check if the adjacency lists are right

import json
import os
import numpy as np

# number of keys in simulation is 4 ** 8
m = 8

# check that each person has good finger table.


def check_adj(adj):
    # get a list of the edges in the adjacency list
    edges = [(int(k), int(v)) for k, l in adj.items() for v in l]

    # extract all distinct nodes in the graph in sorted order.
    all_nodes = {int(k) for k in adj}
    all_nodes = sorted(all_nodes)

    # keep track of the finger tables for each node.
    fingers = {}

    # iterate through nodes and calculate the finger tables.
    for node in all_nodes:
        # initialize finger table for this node
        fingers[node] = set()

        # rotate the list of sorted nodes such that successor
        # of the current node is first.
        rotated_nodes = [(n - node) % 4**m for n in all_nodes]
        my_index = rotated_nodes.index(0)
        rotated_nodes = rotated_nodes[my_index+1:] + rotated_nodes[:my_index]

        # calculate successor(node + 4 ** i), add to finger table.
        for i in range(m):
            plus = 4 ** i
            for increment in rotated_nodes:
                # if increment >= plus, then (increment+node) % 4**m is
                # in the finger table if it is encountered first.
                if increment >= plus:
                    fingers[node].add((increment + node) % 4 ** m)
                    break

    # construct a set of the edges that should exist due to fingers
    fingers_edges = set()
    for k, set_conns in fingers.items():
        for v in set_conns:
            fingers_edges.add((k, v))
            fingers_edges.add((v, k))

    # look at the set of edges that actually exist
    set_edges = set(edges)

    # print out results
    print("length of edges list:", len(set_edges))
    print("length of fingers list:", len(fingers_edges))
    print("set difference edges-fingers:", set_edges - fingers_edges)
    if set_edges != fingers_edges:
        print("edges and fingers do not match")
        return fingers
    print('good :D')
    return None


if __name__ == '__main__':
    # open the data.json file containing each adjacency dicts at each timestep
    with open(os.path.join(os.getcwd(), 'data.json'), 'r') as f:
        adj = json.load(f)
    # run the adjacency check on the final graph

    ret = check_adj(adj[-1])
    if ret is not None:
        with open(os.path.join(os.getcwd(), 'fingers.json'), 'w') as f:
            json.dump([{k: list(ret[k]) for k in ret}], f)
        os.system('python .\\timestamps.py fingers.json correct')
