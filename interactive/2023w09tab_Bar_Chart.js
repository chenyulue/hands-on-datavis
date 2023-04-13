importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.4/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.4/dist/wheels/panel-0.14.4-py3-none-any.whl', 'pyodide-http==0.1.0', 'matplotlib', 'pandas']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# # 1、Introduction
# 
# This challenge comes from [#WOW2023 | Week 9 | A tricky filter](https://workout-wednesday.com/2023w09tab/). Its task mainly focuses on the interactivity of a bar chart.
# 
# I'll use \`panel\` for interactivity design, and \`matplotlib\` for the bar chart plotting. Without further ado, let's do it!
# 
# First import some compulsory libraries for the data manipulation and visualization design.

# In[1]:


# For data manipulation
import pandas as pd

# For data visualization
# According https://panel.holoviz.org/reference/panes/Matplotlib.html, we should use 
# the matplotlib.figure api instead of matplotlib.pyplot api with panel
import matplotlib.figure as mfig

# For interactivity
import panel as pn
pn.extension('ipywidgets')


# In[2]:


data_file = "./datasets/Superstore 2022.4.csv"
sale_data = pd.read_csv(data_file, index_col=0)
sale_data.head()


# In[3]:


# Select the sales data from the State of Ohio
Ohio_data = sale_data.query("\`State/Province\` == 'Ohio'").loc[:, ["City", "Sales"]]
sales_Ohio = Ohio_data.groupby(by="City").sum()

key_cities = ['Cincinnati', 'Akron', 'Toledo', 'Cleveland', 'Columbus']
key_cities_data = sales_Ohio.loc[key_cities, :]

other_cities = [city for city in sales_Ohio.index if city not in key_cities]
other_cities_data = sales_Ohio.loc[other_cities, :]

key_cities_data


# In[4]:


import matplotlib.pyplot as plt
px = 1 / plt.rcParams['figure.dpi']
colors = ["#71264A", "#D3D3D3"]

fig = mfig.Figure(figsize=(1000*px, 700*px))
ax = fig.subplots()

bar = ax.barh(y=key_cities_data.index, width=key_cities_data["Sales"], color=colors[0])

pn.pane.Matplotlib(fig)


# In[5]:


title = pn.pane.HTML("<h2><b># WOW2023 Week 9: A tricky filter</b></h2>" + 
                     "Can you allow users to filter out any city except for " +
                     f"a select few <span style='color:{colors[0]};font-weight:bold'>Key Cities</span>?")
selected_cities = pn.widgets.MultiSelect(value=[], options=list(other_cities_data.index), size=8)

sort_by = pn.widgets.Select(options=['Key Cities', 'Sales'], value='Key Cities')

widgets = pn.Column(title, 
                  pn.Row("Filter Cities", selected_cities), 
                  pn.Row("Sort By" + "&nbsp;"*7, sort_by), 
                  align="start", width=450)

def plot_bar(selected_cities=[], sort_by="Key Cities"):
    fig = mfig.Figure(figsize=(700*px, 500*px))
    ax = fig.subplots()
    
    key_cities_data['color'] = colors[0]
    
    if selected_cities:
        selected_data = other_cities_data.loc[selected_cities, :]
        selected_data['color'] = colors[1]
        if sort_by == "Key Cities":
            data = pd.concat([selected_data.sort_values(by="Sales"), key_cities_data])
        else:
            data = pd.concat([selected_data, key_cities_data]).sort_values(by="Sales")
    else:
        data = key_cities_data
        
    bars = ax.barh(y=data.index, width=data["Sales"], color=data["color"])
    
    ax.bar_label(bars, fmt="{:,.0f}", padding=5)
    ax.xaxis.set_ticks([0, 5000, 10000, 15000], labels=["0K", "5K", "10K", "15K"])
    ax.set_xlabel("Sale")
    
    ax.grid(True, axis='x')
    ax.set_axisbelow(True)
    grid_color = ax.xaxis.get_gridlines()[0].get_color()
    
    ax.spines[["bottom", "right", "top"]].set_visible(False)
    ax.spines["left"].set_color(grid_color)
    
    ax.tick_params(color=grid_color)
    ax.tick_params(labelcolor=grid_color, axis="x")
    
    return fig

iplot = pn.bind(plot_bar, selected_cities=selected_cities, sort_by=sort_by)

app = pn.Row(widgets, iplot).servable()
app


# In[ ]:






await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()