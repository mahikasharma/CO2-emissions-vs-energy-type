// scatter.js
// D3 scatter plot: Renewable Energy Share vs CO2 Emissions
// Interactions: region dropdown (defaults to Northeast), hover tooltip, brush + mini bar chart
// Call initScatter("#scatter-container") after DOM is ready
// Expects eia_data.csv in the same directory

const CSV_PATH = "eia_data.csv";

const REGION_MAP = {
  CT:"Northeast",ME:"Northeast",MA:"Northeast",NH:"Northeast",RI:"Northeast",
  VT:"Northeast",NJ:"Northeast",NY:"Northeast",PA:"Northeast",
  DE:"South",FL:"South",GA:"South",MD:"South",NC:"South",SC:"South",
  VA:"South",WV:"South",AL:"South",KY:"South",MS:"South",TN:"South",
  AR:"South",LA:"South",OK:"South",TX:"South",DC:"South",
  IL:"Midwest",IN:"Midwest",MI:"Midwest",OH:"Midwest",WI:"Midwest",
  IA:"Midwest",KS:"Midwest",MN:"Midwest",MO:"Midwest",NE:"Midwest",
  ND:"Midwest",SD:"Midwest",
  AZ:"West",CO:"West",ID:"West",MT:"West",NV:"West",NM:"West",
  UT:"West",WY:"West",AK:"West",CA:"West",HI:"West",OR:"West",WA:"West"
};

const REGIONS = ["Northeast", "South", "Midwest", "West"];
const GREEN   = "#4a9a6e"; 

function getDominantSource(row) {
  const sources = {
    "Coal":        +row.Coal_Consumption      || 0,
    "Natural Gas": +row.NatGas_Consumption    || 0,
    "Nuclear":     +row.Nuclear_Consumption   || 0,
    "Renewables":  +row.Renewable_Consumption || 0,
  };
  return Object.entries(sources).sort((a,b) => b[1]-a[1])[0][0];
}

function linearRegression(data, xFn, yFn) {
  const n = data.length;
  if (n < 2) return null;
  const mx  = d3.mean(data, xFn);
  const my  = d3.mean(data, yFn);
  const num = d3.sum(data, d => (xFn(d) - mx) * (yFn(d) - my));
  const den = d3.sum(data, d => (xFn(d) - mx) ** 2);
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

function initScatter(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) { console.error("scatter: container not found:", containerSelector); return; }

  const margin  = { top: 24, right: 30, bottom: 60, left: 76 };
  const totalW  = container.clientWidth || 860;
  const desiredH = Math.round(totalW * 0.56);
  const frameEl  = window.frameElement;
  const frameH   = frameEl ? frameEl.getBoundingClientRect().height : null;
  const totalH   = frameH
    ? Math.max(360, Math.min(desiredH, Math.round(frameH - 180)))
    : desiredH;
  const innerW  = totalW - margin.left - margin.right;
  const innerH  = totalH - margin.top  - margin.bottom;

  const barH      = 150;
  const barMargin = { top: 20, right: 20, bottom: 36, left: 60 };

  container.innerHTML = `
    <div class="scatter-controls" id="scatter-legend" style="margin-bottom:12px;"></div>
    <svg id="scatter-svg"
         width="${totalW}" height="${totalH}"
         viewBox="0 0 ${totalW} ${totalH}"
         style="display:block;max-width:100%;background:#ffffff;border-radius:6px;"></svg>
    <div class="scatter-brush-info" id="scatter-brush-info">
      Drag on the chart to select a group of points
    </div>
    <div id="scatter-bar-wrap" style="display:none;margin-top:8px;">
      <svg id="scatter-bar-svg" width="${totalW}" height="${barH}"
           viewBox="0 0 ${totalW} ${barH}"
           style="display:block;max-width:100%;background:#ffffff;border-radius:6px;"></svg>
    </div>
  `;

  // Tooltip
  let ttEl = document.getElementById("scatter-tooltip");
  if (!ttEl) {
    ttEl = document.createElement("div");
    ttEl.id = "scatter-tooltip";
    ttEl.innerHTML = `
      <div class="stt-state"  id="stt-state"></div>
      <div class="stt-region" id="stt-region"></div>
      <div class="stt-row"><span class="stt-k">Year</span>            <span class="stt-v" id="stt-year"></span></div>
      <div class="stt-row"><span class="stt-k">Renewable Share</span> <span class="stt-v" id="stt-renew"></span></div>
      <div class="stt-row"><span class="stt-k">CO2 (Mil. Mt)</span>   <span class="stt-v" id="stt-co2"></span></div>
      <div class="stt-row"><span class="stt-k">Dom. Source</span>     <span class="stt-v" id="stt-source"></span></div>
    `;
    document.body.appendChild(ttEl);
  }

  const showTT = (event, d) => {
    document.getElementById("stt-state").textContent  = d.state;
    document.getElementById("stt-region").textContent = d.region;
    document.getElementById("stt-region").style.color = GREEN;
    document.getElementById("stt-year").textContent   = d.year;
    document.getElementById("stt-renew").textContent  = d.renewPct.toFixed(1) + "%";
    document.getElementById("stt-co2").textContent    = d3.format(",")(Math.round(d.co2));
    document.getElementById("stt-source").textContent = d.source;

    const pad = 14, tw = 210, th = 130;
    let tx = event.clientX + pad;
    let ty = event.clientY - 60;
    if (tx + tw > window.innerWidth)  tx = event.clientX - tw - pad;
    if (ty + th > window.innerHeight) ty = window.innerHeight - th - 8;
    if (ty < 8) ty = 8;

    ttEl.style.left = tx + "px";
    ttEl.style.top  = ty + "px";
    ttEl.classList.add("visible");
  };
  const hideTT = () => ttEl.classList.remove("visible");

  // Load CSV
  d3.csv(CSV_PATH).then(raw => {
    const rows = raw
      .filter(d => +d.Year >= 1981 && d.State !== "US" && REGION_MAP[d.State])
      .map(d => {
        const total    = +d.Total_Energy_Consumption || 0;
        const renew    = +d.Renewable_Consumption    || 0;
        const renewPct = total > 0 ? (renew / total) * 100 : null;
        return {
          state:    d.State,
          region:   REGION_MAP[d.State],
          year:     d.Year,
          renewPct,
          co2:      +d.CO2_Emissions,
          source:   getDominantSource(d),
        };
      })
      .filter(d => d.renewPct !== null && isFinite(d.renewPct) && isFinite(d.co2));

    if (rows.length === 0) {
      container.innerHTML = `<p style="color:#c0552a;padding:16px">No data loaded.</p>`;
      return;
    }
    renderChart(rows);
  }).catch(err => {
    container.innerHTML = `<p style="color:#c0552a;padding:16px">Could not load ${CSV_PATH}.<br><small>${err}</small></p>`;
  });

  function renderChart(rows) {
    const svg = d3.select("#scatter-svg");

    // White background rect (belt-and-suspenders)
    svg.append("rect")
      .attr("width", totalW).attr("height", totalH)
      .attr("fill", "#ffffff");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales over full dataset so axes don't jump when switching regions
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(rows, d => d.renewPct) * 1.06]).nice()
      .range([0, innerW]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(rows, d => d.co2) * 1.08]).nice()
      .range([innerH, 0]);

    const fmt = v => v >= 1000 ? (v/1000).toFixed(0)+"k" : v;

    // Grid
    g.append("g").attr("class","scatter-grid")
      .call(d3.axisLeft(yScale).tickSize(-innerW).tickFormat(""))
      .call(ax => ax.select(".domain").remove());

    g.append("g").attr("class","scatter-grid")
      .attr("transform",`translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).tickSize(-innerH).tickFormat(""))
      .call(ax => ax.select(".domain").remove());

    // Axes
    g.append("g").attr("class","scatter-axis")
      .attr("transform",`translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(7).tickFormat(v => v.toFixed(0) + "%"));

    g.append("g").attr("class","scatter-axis")
      .call(d3.axisLeft(yScale).ticks(6).tickFormat(fmt));

    // Axis labels
    svg.append("text").attr("class","scatter-axis-label")
      .attr("x", margin.left + innerW / 2).attr("y", totalH - 10)
      .attr("text-anchor","middle")
      .text("Renewable Energy Share (% of Total Consumption)");

    svg.append("text").attr("class","scatter-axis-label")
      .attr("transform","rotate(-90)")
      .attr("x", -(margin.top + innerH / 2)).attr("y", 16)
      .attr("text-anchor","middle")
      .text("CO2 Emissions (Million Metric Tons)");

    // Regression line (one, updated on region change)
    const regLine = g.append("line")
      .attr("class","scatter-reg-line")
      .attr("stroke", GREEN)
      .attr("stroke-width", 2.2)
      .attr("stroke-dasharray", "7 4")
      .attr("opacity", 0.9);

    // Dots layer
    const dotsG = g.append("g").attr("class","scatter-dots");

    // Brush layer added after dots
    let brushedStates = null;

    // Dropdown
    const legendEl = d3.select("#scatter-legend");

    legendEl.append("label")
      .attr("for","region-dropdown")
      .attr("class","scatter-legend-label")
      .style("margin-right","8px")
      .text("Select Region:");

    const dropdown = legendEl.append("select")
      .attr("id","region-dropdown")
      .attr("class","scatter-dropdown")
      .style("padding","4px 10px")
      .style("border-radius","16px")
      .style("border","1.5px solid #d0ccc6")
      .style("font-family","sans-serif")
      .style("font-size","0.82rem")
      .style("cursor","pointer")
      .style("background","#fff");

    REGIONS.forEach(r => {
      dropdown.append("option").attr("value", r).text(r);
    });

    // Reset button
    legendEl.append("button")
      .attr("class","scatter-reset-btn")
      .style("margin-left","12px")
      .text("Reset brush")
      .on("click", () => {
        brushLayer.call(brush.move, null);
        brushedStates = null;
        setBrushInfo(null);
        applyVisibility(currentRegion());
      });

    function currentRegion() {
      return document.getElementById("region-dropdown").value;
    }

    // Draw / update for a given region
    function update(region) {
      const regionRows = rows.filter(d => d.region === region);

      // Update dots join on full rows but control opacity
      const dots = dotsG.selectAll("circle").data(rows, d => d.state + d.year);

      dots.join(
        enter => enter.append("circle")
          .attr("cx", d => xScale(d.renewPct))
          .attr("cy", d => yScale(d.co2))
          .attr("r", 3.5)
          .attr("fill", GREEN)
          .attr("fill-opacity", 0.55)
          .attr("stroke", GREEN)
          .attr("stroke-width", 0.5)
          .attr("stroke-opacity", 0.4)
          .style("cursor","pointer"),
        update => update
          .attr("cx", d => xScale(d.renewPct))
          .attr("cy", d => yScale(d.co2))
      );

      // Reapply visibility with new region
      applyVisibility(region);

      // Tooltip events (re-bind after join)
      dotsG.selectAll("circle")
        .on("mousemove", function(event, d) {
          if (d.region !== region) return;
          if (brushedStates !== null && !brushedStates.has(d.state + d.year)) return;
          showTT(event, d);
        })
        .on("mouseleave", hideTT);

      // Update regression line
      const reg = linearRegression(regionRows, d => d.renewPct, d => d.co2);
      if (reg && regionRows.length >= 2) {
        const xMin = d3.min(regionRows, d => d.renewPct);
        const xMax = d3.max(regionRows, d => d.renewPct);
        const clamp = v => Math.max(0, Math.min(innerH, v));
        regLine
          .attr("x1", xScale(xMin))
          .attr("y1", clamp(yScale(reg.slope * xMin + reg.intercept)))
          .attr("x2", xScale(xMax))
          .attr("y2", clamp(yScale(reg.slope * xMax + reg.intercept)))
          .attr("opacity", 0.9);
      } else {
        regLine.attr("opacity", 0);
      }
    }

    function applyVisibility(region) {
      dotsG.selectAll("circle")
        .attr("opacity", d => {
          const regionOk = d.region === region;
          const brushOk  = brushedStates === null || brushedStates.has(d.state + d.year);
          if (!regionOk) return 0.04;
          return brushOk ? 0.85 : 0.08;
        });
    }

    // Dropdown change
    dropdown.on("change", function() {
      brushedStates = null;
      brushLayer.call(brush.move, null);
      setBrushInfo(null);
      update(this.value);
    });

    // Brush bar chart
    function updateBrushBar(sel) {
      const barWrap = document.getElementById("scatter-bar-wrap");
      const barSvg  = d3.select("#scatter-bar-svg");
      barSvg.selectAll("*").remove();

      if (!sel || sel.length === 0) {
        barWrap.style.display = "none";
        return;
      }

      barWrap.style.display = "block";

      // White background
      barSvg.append("rect")
        .attr("width", totalW).attr("height", barH).attr("fill","#ffffff");

      const counts = REGIONS.map(r => ({
        region: r,
        count:  sel.filter(d => d.region === r).length
      }));

      const bw = totalW - barMargin.left - barMargin.right;
      const bh = barH   - barMargin.top  - barMargin.bottom;
      const bg = barSvg.append("g")
        .attr("transform",`translate(${barMargin.left},${barMargin.top})`);

      const xB = d3.scaleBand().domain(REGIONS).range([0, bw]).padding(0.35);
      const yB = d3.scaleLinear()
        .domain([0, d3.max(counts, d => d.count) * 1.15 || 1]).nice()
        .range([bh, 0]);

      bg.append("g").attr("class","scatter-grid")
        .call(d3.axisLeft(yB).ticks(4).tickSize(-bw).tickFormat(""))
        .call(ax => ax.select(".domain").remove());

      bg.selectAll("rect.bar")
        .data(counts)
        .join("rect")
          .attr("class","bar")
          .attr("x",      d => xB(d.region))
          .attr("y",      d => yB(d.count))
          .attr("width",  xB.bandwidth())
          .attr("height", d => bh - yB(d.count))
          .attr("fill",   GREEN)
          .attr("opacity", d => d.region === currentRegion() ? 0.82 : 0.2)
          .attr("rx", 3);

      bg.selectAll(".bar-label")
        .data(counts)
        .join("text")
          .attr("class","bar-label")
          .attr("x", d => xB(d.region) + xB.bandwidth() / 2)
          .attr("y", d => yB(d.count) - 4)
          .attr("text-anchor","middle")
          .style("font-size","11px")
          .style("fill","#1a1714")
          .style("font-weight","500")
          .text(d => d.count > 0 ? d.count : "");

      bg.append("g").attr("class","scatter-axis")
        .attr("transform",`translate(0,${bh})`)
        .call(d3.axisBottom(xB).tickSize(0))
        .call(ax => ax.select(".domain").remove());

      bg.append("g").attr("class","scatter-axis")
        .call(d3.axisLeft(yB).ticks(4));

      barSvg.append("text").attr("class","scatter-axis-label")
        .attr("transform","rotate(-90)")
        .attr("x", -(barMargin.top + bh / 2)).attr("y", 13)
        .attr("text-anchor","middle")
        .text("# Points Selected");

      barSvg.append("text").attr("class","scatter-axis-label")
        .attr("x", barMargin.left + bw / 2).attr("y", 13)
        .attr("text-anchor","middle")
        .style("font-weight","600").style("font-size","12px")
        .text("Selected Points by Region");
    }

    // Brush 
    function setBrushInfo(selection) {
      const el = document.getElementById("scatter-brush-info");
      if (!selection) {
        brushedStates = null;
        el.innerHTML = "Drag on the chart to select a group of points";
        updateBrushBar(null);
        return;
      }
      const [[x0,y0],[x1,y1]] = selection;
      const region = currentRegion();
      const sel = rows.filter(d => {
        const cx = xScale(d.renewPct), cy = yScale(d.co2);
        return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1
               && d.region === region;
      });
      if (sel.length === 0) {
        brushedStates = null;
        el.innerHTML = "No points in selection — try a different area";
        updateBrushBar(null);
      } else {
        brushedStates = new Set(sel.map(d => d.state + d.year));
        const avgR   = d3.mean(sel, d => d.renewPct);
        const avgC   = d3.mean(sel, d => d.co2);
        const states = [...new Set(sel.map(d => d.state))].sort();
        el.innerHTML =
          `<strong>${sel.length} data point${sel.length > 1 ? "s" : ""}</strong>` +
          ` (${states.length} state${states.length>1?"s":""}: ${states.join(", ")}) &nbsp;·&nbsp; ` +
          `Avg renewable share <strong>${avgR.toFixed(1)}%</strong> &nbsp;·&nbsp; ` +
          `Avg CO2 <strong>${d3.format(",.0f")(avgC)} mil. Mt</strong>`;
        updateBrushBar(sel);
      }
      applyVisibility(region);
    }

    const brush = d3.brush()
      .extent([[0,0],[innerW,innerH]])
      .on("brush",  ({selection}) => { if (selection) setBrushInfo(selection); })
      .on("end",    ({selection}) => { if (!selection) setBrushInfo(null); });

    const brushLayer = g.append("g").attr("class","scatter-brush").call(brush);

    brushLayer.select(".selection")
      .style("fill",         "rgba(74,154,110,0.10)")
      .style("stroke",       GREEN)
      .style("stroke-width", "1.5");

    brushLayer.on("mousedown.tt", hideTT);

    // Initial render default to Northeast 
    dropdown.property("value", "Northeast");
    update("Northeast");
  }
}
