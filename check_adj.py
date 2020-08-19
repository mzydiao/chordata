import json
import os
import numpy as np

with open(os.path.join(os.getcwd(), 'data.json'), 'r') as f:
    adj = json.load(f)

# check if the adjacency lists are right


def check_adj(adj):
    m = 8
    # check that each person has good finger table.
    edges = [(int(k), int(v)) for k, l in adj.items() for v in l]
    all_nodes = {int(k) for k in adj}
    all_nodes = sorted(all_nodes)
    should = {}
    for node in all_nodes:
        should[node] = set()
        # make sure that finger table is right.
        connected = {int(k) for k in adj[str(node)]}
        # want to check that all fingers are in adj[node]
        rotated_nodes = [(n - node) % 4**m for n in all_nodes]
        my_index = rotated_nodes.index(0)
        rotated_nodes = rotated_nodes[my_index+1:] + rotated_nodes[:my_index]
        for i in range(m):
            plus = 4 ** i
            # get node that is >= plus+node
            # do rotation
            for ele in rotated_nodes:
                if ele >= plus:
                    should[node].add((ele+node) % 4 ** m)
                    break
        if len(should[node] - connected) > 0:
            return
    should_edges = set()
    for k, set_conns in should.items():
        for v in set_conns:
            should_edges.add((k, v))
            should_edges.add((v, k))
    set_edges = set(edges)
    print(len(set_edges))
    print(len(should_edges))
    print(set_edges - should_edges)
    if set_edges != should_edges:
        print('bad')
        return should_edges
    print('good')


print(check_adj(adj[-1]))
