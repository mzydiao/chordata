import json
import os
import numpy as np
import matplotlib.pyplot as plt

figs_path = os.path.join(os.getcwd(), 'figs')

with open(os.path.join(os.getcwd(), 'data.json'), 'r') as f:
    adj = json.load(f)


def get_plots(adj, ax):
    # generate plots given an adjacency matrix and an axis for plt
    edges = [(int(k), int(v)) for k, l in adj.items() for v in l]
    all_nodes = {int(k) for k in adj}
    all_nodes = sorted(all_nodes)

    # print all the edges
    for a, b in edges:
        k1, k2 = all_nodes.index(a), all_nodes.index(b)
        degs = [k1/(len(all_nodes)) * 2 * np.pi,
                k2/(len(all_nodes)) * 2 * np.pi]
        ax.plot(np.cos(degs), np.sin(degs))

    # label all the nodes
    for node in all_nodes:
        deg = all_nodes.index(node)/(len(all_nodes)) * 2 * np.pi
        c, s = np.cos(deg)*1.1, np.sin(deg)*1.1
        ax.text(c, s, node,
                horizontalalignment='center',
                verticalalignment='center')


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
plt.savefig(os.path.join(figs_path, 'chord-fingers.png'))
plt.show()
