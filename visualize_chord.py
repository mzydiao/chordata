# goal: produce plots of the chord diagrams at each time step.

import json
import os
import numpy as np
import matplotlib.pyplot as plt
import sys

# generate plots on ax given an adjacency dictionary
def get_plots(adj, ax):
    # retrieve the edges in the adjacency dictionary
    edges = [(int(k), int(v)) for k, l in adj.items() for v in l]

    # extract a sorted list of all nodes
    all_nodes = {int(k) for k in adj}
    all_nodes = sorted(all_nodes)

    # print all the edges
    for a, b in edges:
        # want to uniformly distribute the nodes on the circle
        # so, we can position each node at (cos theta, sin theta)
        # where theta is 2pi * node's index / total # nodes.
        theta1, theta2 = all_nodes.index(a), all_nodes.index(b)
        degs = [theta1/(len(all_nodes)) * 2 * np.pi,
                theta2/(len(all_nodes)) * 2 * np.pi]

        # connect a, b
        ax.plot(np.cos(degs), np.sin(degs))

    # label all the nodes
    for node in all_nodes:
        # calculate the degree of location of the node
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

    # create figure object
    fig, axes = plt.subplots(
        int(np.ceil(len(adj)/5)), 5,
        figsize=(50, 2*(len(adj) + 5 - (len(adj) % 5)))
    )

    # make plot
    for a, ax in zip(adj, axes.flatten()):
        get_plots(a, ax)
        ax.axis('off')
    # remove ax not in zip
    for ax in axes.flatten()[len(adj):]:
        ax.axis('off')

    # save figures
    plt.savefig(os.path.join(figs_path, '%s.png' % sys.argv[-1]))