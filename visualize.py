# goal: produce plots of the messages at each time step.

import json
import numpy as np
import matplotlib.pyplot as plt
import os
import sys
import shutil
import argparse
import check_adj

# generate plots on ax given an adjacency dictionary


class MessageGraph:
    def __init__(self, all_nodes, indices, lim):
        self.all_nodes = all_nodes
        self.indices = indices
        self.lim = lim
        self.max_node_length = max(map(lambda i: len(str(i)), all_nodes))

    def get_deg(self, node):
        node = int(node)
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

    def plot(self, ax, adj=None, msgs=None, holds=None, truncate=-1):
        lim = self.lim
        ax.clear()
        ax.axis('off')
        ax.set_xlim(left=-lim, right=lim)
        ax.set_ylim(top=lim, bottom=-lim)
        if adj is not None:
            self.plot_adj(adj, ax, truncate)
        if msgs is not None:
            self.plot_msg(msgs, ax)
        if holds is not None:
            self.plot_holds(holds, ax)

    def plot_msg(self, msgs, ax):
        for a, b in msgs:
            degs = list(map(self.get_deg, (a, b)))

            x1, x2 = np.cos(degs)
            y1, y2 = np.sin(degs)

            ax.annotate("",
                        xy=(x2, y2), xycoords='data',
                        xytext=(x1, y1), textcoords='data',
                        arrowprops=dict(arrowstyle="->",
                                        mutation_scale=15,
                                        lw=2,
                                        connectionstyle="arc3",
                                        color="tab:green"),
                        )

    def plot_holds(self, holds, ax):
        degs = list(map(self.get_deg, holds))
        ax.scatter(np.cos(degs), np.sin(degs), zorder=10)

    def plot_adj(self, adj, ax, truncate):
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
        for node in adj:
            # calculate the degree of location of the node
            deg = self.get_deg(node)

            # calculate coordinate given degree
            scale = 1.25
            c, s = np.cos(deg)*scale, np.sin(deg)*scale

            # label the coordinate
            label = node if truncate == - \
                1 else str(node)[:truncate + len(str(node)) - self.max_node_length]
            ax.text(c, s, label,
                    horizontalalignment='center',
                    verticalalignment='center')


if __name__ == '__main__':

    parser = argparse.ArgumentParser(description='visualize chord graph')
    parser.add_argument('output', help='output file/folder')
    parser.add_argument('--input', '-i', default='data.json',
                        help='input json file')
    parser.add_argument('--folder', '-f', action='store_true',
                        help='output as folder')
    parser.add_argument('--truncate', '-t', nargs='?', type=int, const=4,
                        default=-1, help='truncate node names')
    parser.add_argument('--last', '-l', action='store_true',
                        help='only plot last snapshot')
    parser.add_argument(
        '--check', '-c', action='store_true', help='check good')
    args = parser.parse_args()

 # read the adjacency matrix JSON file
    figs_path = os.path.join(os.getcwd(), 'figs')
    in_file = args.input
    with open(os.path.join(os.getcwd(), in_file), 'r') as f:
        snapshots = json.load(f)

    fig, ax = plt.subplots(1, 1, figsize=(5, 5))

    all_nodes = {int(k) for k in snapshots[-1]['adj']}
    all_nodes = sorted(all_nodes)

    indices = {node: i for i, node in enumerate(all_nodes)}

    lim = 1.5

    graph = MessageGraph(all_nodes, indices, lim)

    if args.folder:
        export_path = os.path.join(figs_path, args.output)
        if os.path.exists(export_path):
            shutil.rmtree(export_path)
        os.mkdir(export_path)
        def filename(i): return '%d.png' % i
    else:
        export_path = figs_path
        def filename(i): return '%s-%i.png' % (args.output, i)

    snapshots = [snapshots[-1]] if args.last else snapshots
    for i, t in enumerate(snapshots):
        # snapshots: adj, msgs, holders
        adj = t['adj']
        msgs = t['msgs']
        holders = t['holders']
        graph.plot(ax, adj=adj, msgs=msgs,
                   holds=holders, truncate=args.truncate)
        plt.savefig(os.path.join(export_path, filename(i)), dpi=300)

        if args.last:
            break

    if args.check:
        ret = check_adj.check_adj(snapshots[-1]['adj'])
        if ret:
            graph.plot(ax, adj=ret, truncate=args.truncate)
            plt.savefig(os.path.join(export_path, 'correct.png'), dpi=300)
