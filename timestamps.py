# goal: produce plots of the chord diagrams at each time step.

import json
import os
import numpy as np
import sys
import matplotlib.pyplot as plt

# generate plots on ax given an adjacency dictionary
def get_plots(adj, ax, all_nodes = None, indices = None):
    # retrieve the edges in the adjacency dictionary
    edges = [(int(k), int(v)) for k, l in adj.items() for v in l]

    if all_nodes is None:
        # extract a sorted list of all nodes
        all_nodes = {int(k) for k in adj}
        all_nodes = sorted(all_nodes)

    # print all the edges
    for a, b in edges:
        # want to uniformly distribute the nodes on the circle
        # so, we can position each node at (cos theta, sin theta)
        # where theta is 2pi * node's index / total # nodes.
        if indices is not None:
            theta1, theta2 = indices[a], indices[b]
        else: 
            theta1, theta2 = all_nodes.index(a), all_nodes.index(b)
        degs = [theta1/(len(all_nodes)) * 2 * np.pi,
                theta2/(len(all_nodes)) * 2 * np.pi]

        # connect a, b
        ax.plot(np.cos(degs), np.sin(degs), 'tab:gray')

    # label all the nodes
    for node in {int(k) for k in adj}:
        # calculate the degree of location of the node
        if indices is not None:
            deg = indices[node]/len(all_nodes) * 2 * np.pi
        else: 
            deg = all_nodes.index(node)/(len(all_nodes)) * 2 * np.pi

        # calculate coordinate given degree
        c, s = np.cos(deg)*1.1, np.sin(deg)*1.1

        #label the coordinate
        ax.text(c, s, node,
                horizontalalignment='center',
                verticalalignment='center')


if __name__ == '__main__':
    # read the adjacency matrix JSON file
    figs_path = os.path.join(os.getcwd(), 'figs')
    with open(os.path.join(os.getcwd(), 'data.json'), 'r') as f:
        adj = json.load(f)

    fig, ax = plt.subplots(1, 1, figsize=(10,10))

    all_nodes = {int(k) for k in adj[-1]}
    all_nodes = sorted(all_nodes)

    indices = {node: i for i, node in enumerate(all_nodes)}

    lim = 1.0
    for i in range(len(adj)):
        ax.clear()
        ax.axis('off')
        ax.set_xlim(left = -lim, right = lim)
        ax.set_ylim(top = lim, bottom=-lim)
        get_plots(adj[i], ax, all_nodes=all_nodes, indices=indices)
        plt.savefig(os.path.join(figs_path,'chord-fingers-%d.png' % i), dpi=300)