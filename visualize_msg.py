# goal: produce plots of the messages at each time step.

import json
import os
import numpy as np
import sys
import matplotlib.pyplot as plt

# generate plots on ax given an adjacency dictionary

class MessageGraph:
    def __init__(self, all_nodes, indices):
        self.all_nodes = all_nodes
        self.indices = indices
    
    def get_deg(self, node):
        all_nodes, indices = self.all_nodes, self.indices
        if all_nodes is None:
            # extract a sorted list of all nodes
            all_nodes = {int(k) for k in adj}
            all_nodes = sorted(all_nodes)
        if indices is not None:
            deg = indices[node]/len(all_nodes) * 2 * np.pi
        else:
            deg = all_nodes.index(node)/(len(all_nodes)) * 2 * np.pi
        return deg
        
    def plot(self, ax, adj, msgs, holds):
        ax.clear()
        ax.axis('off')
        ax.set_xlim(left=-lim, right=lim)
        ax.set_ylim(top=lim, bottom=-lim)
        self.plot_adj(adj, ax)
        self.plot_msg(msgs, ax)
        self.plot_holds(holds, ax)

    def plot_msg(self, msgs, ax):
        all_nodes, indices = self.all_nodes, self.indices
        if all_nodes is None:
            # extract a sorted list of all nodes
            all_nodes = {int(k) for k in adj}
            all_nodes = sorted(all_nodes)

        for a, b in msgs:
            if indices is not None:
                theta1, theta2 = indices[a], indices[b]
            else:
                theta1, theta2 = all_nodes.index(a), all_nodes.index(b)
            degs = [theta1/(len(all_nodes)) * 2 * np.pi,
                    theta2/(len(all_nodes)) * 2 * np.pi]

            # connect a, b
            ax.plot(np.cos(degs), np.sin(degs), 'tab:blue')

    def plot_holds(self, holds, ax):
        degs = list(map(self.get_deg, holds))
        ax.scatter(np.cos(degs), np.sin(degs))
        

    def plot_adj(self, adj, ax):
        # retrieve the edges in the adjacency dictionary
        edges = [(int(k), int(v)) for k, l in adj.items() for v in l]

        # print all the edges
        for a, b in edges:
            # want to uniformly distribute the nodes on the circle
            # so, we can position each node at (cos theta, sin theta)
            # where theta is 2pi * node's index / total # nodes.
            degs = list(map(self.get_deg, (a, b)))

            # connect a, b
            ax.plot(np.cos(degs), np.sin(degs), 'tab:gray')

        # label all the nodes
        for node in {int(k) for k in adj}:
            # calculate the degree of location of the node
            deg = self.get_deg(node)

            # calculate coordinate given degree
            c, s = np.cos(deg)*1.1, np.sin(deg)*1.1

            # label the coordinate
            ax.text(c, s, node,
                    horizontalalignment='center',
                    verticalalignment='center')

if __name__ == '__main__':
    # read the adjacency matrix JSON file
    figs_path = os.path.join(os.getcwd(), 'figs')
    in_file = sys.argv[1] if len(sys.argv) == 3 else 'data.json'
    with open(os.path.join(os.getcwd(), in_file), 'r') as f:
        snapshots = json.load(f)

    fig, ax = plt.subplots(1, 1, figsize=(5, 5))

    all_nodes = {int(k) for k in snapshots[-1]['adj']}
    all_nodes = sorted(all_nodes)

    indices = {node: i for i, node in enumerate(all_nodes)}

    graph = MessageGraph(all_nodes, indices)
    lim = 1.5
    for i, t in enumerate(snapshots):
        # snapshots: adj, msgs, holders
        adj = t['adj']
        msgs = t['msgs']
        holders = t['holders']
        graph.plot(ax, adj, msgs, holders)
        plt.savefig(os.path.join(figs_path, '%s-%d.png' %
                                 (sys.argv[-1], i)), dpi=300)
