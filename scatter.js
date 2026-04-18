// scatter.js
// D3 scatter plot showing renewable energy share (%) vs CO2 emissions by state
// Interactions: hover tooltip, click-to-filter by region, brush selection + mini bar chart
// Call initScatter("#scatter-container") after the DOM is ready
// Expects eia_data.csv in the same directory as the HTML file

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

const REGION_COLORS = {
  Northeast: "#3b6ea5",
  South:     "#c0552a",
  Midwest:   "#4a9a6e",
  West:      "#8b5ea5"
};

function getDominantSource(row) {
  const sources = {
    "Coal":        +row.Coal_Consumption        || 0,
    "Natural Gas": +row.NatGas_Consumption      || 0,
    "Nuclear":     +row.Nuclear_Consumption     || 0,
    "Renewables":  +row.Renewable_Consumption   || 0,
  };
  return Object.entries(sources).sort((a,b) => b[1]-a[1])[0][0];
}

// Simple linear regression returns {slope, intercept}
function linearRegression(data, xFn, yFn) {
  const n = data.length;
  if (n < 2) return null;
  const mx = d3.mean(data, xFn);
  const my = d3.mean(data, yFn);
  const num = d3.sum(data, d => (xFn(d) - mx) * (yFn(d) - my));
  const den = d3.sum(data, d => (xFn(d) - mx) ** 2);
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  return { slope, intercept };
}

function initScatter(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (!container) { console.error("scatter: container not found:", containerSelector); return; }

  const margin = { top: 20, right: 30, bottom: 60, left: 76 };
  const totalW   = container.clientWidth || 860;
  const desiredH = Math.round(totalW * 0.56);
  const frameEl  = window.frameElement;
  const frameH   = frameEl ? frameEl.getBoundingClientRect().height : null;
  const totalH   = frameH
    ? Math.max(360, Math.min(desiredH, Math.round(frameH - 180)))
    : desiredH;
  const innerW   = totalW - margin.left - margin.right;
  const innerH   = totalH - margin.top  - margin.bottom;

  // Mini bar chart dimensions
  const barH      = 140;
  const barMargin = { top: 16, right: 20, bottom: 36, left: 60 };

  container.innerHTML = `
    <div class="scatter-controls" id="scatter-legend"></div>
    <svg id="scatter-svg"
         width="${totalW}" height="${totalH}"
         viewBox="0 0 ${totalW} ${totalH}"
         style="display:block;max-width:100%"></svg>
    <div class="scatter-brush-info" id="scatter-brush-info">
      Drag on the chart to select a group of points
    </div>
    <div id="scatter-bar-wrap" style="display:none;margin-top:8px;">
      <svg id="scatter-bar-svg" width="${totalW}" height="${barH}"
           viewBox="0 0 ${totalW} ${barH}"
           style="display:block;max-width:100%"></svg>
    </div>
  `;

  let ttEl = document.getElementById("scatter-tooltip");
  if (!ttEl) {
    ttEl = document.createElement("div");
    ttEl.id = "scatter-tooltip";
    ttEl.innerHTML = `
      <div class="stt-state"  id="stt-state"></div>
      <div class="stt-region" id="stt-region"></div>
      <div class="stt-row"><span class="stt-k">Year</span>             <span class="stt-v" id="stt-year"></span></div>
      <div class="stt-row"><span class="stt-k">Renewable Share</span>  <span class="stt-v" id="stt-renew"></span></div>
      <div class="stt-row"><span class="stt-k">CO2 (Mil. Mt)</span>    <span class="stt-v" id="stt-co2"></span></div>
      <div class="stt-row"><span class="stt-k">Dom. Source</span>      <span class="stt-v" id="stt-source"></span></div>
    `;
    document.body.appendChild(ttEl);
  }

  const showTT = (event, d) => {
    document.getElementById("stt-state").textContent   = d.state;
    document.getElementById("stt-region").textContent  = d.region;
    document.getElementById("stt-region").style.color  = REGION_COLORS[d.region];
    document.getElementById("stt-year").textContent    = d.year;
    document.getElementById("stt-renew").textContent   = d.renewPct.toFixed(1) + "%";
    document.getElementById("stt-co2").textContent     = d3.format(",")(Math.round(d.co2));
    document.getElementById("stt-source").textContent  = d.source;

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
      container.innerHTML = `<p style="color:#c0552a;padding:16px">
        No data loaded. Check that <code>${CSV_PATH}</code> is in the same folder.
      </p>`;
      return;
    }
    renderChart(rows);
  }).catch(err => {
    console.error("scatter: CSV load failed", err);
    container.innerHTML = `<p style="color:#c0552a;padding:16px">
      Could not load <code>${CSV_PATH}</code>.<br><small>${err}</small>
    </p>`;
  });

  function renderChart(rows) {
    const svg = d3.select("#scatter-svg");
    const g   = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

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

    svg.append("text").attr("class","scatter-axis-label")
      .attr("x", margin.left + innerW / 2).attr("y", totalH - 12)
      .attr("text-anchor","middle")
      .text("Renewable Energy Share (% of Total Consumption)");

    svg.append("text").attr("class","scatter-axis-label")
      .attr("transform","rotate(-90)")
      .attr("x", -(margin.top + innerH / 2)).attr("y", 16)
      .attr("text-anchor","middle")
      .text("CO2 Emissions (Million Metric Tons)");

    //  Regression lines per region (drawn under dots) 
    const regions = Object.keys(REGION_COLORS);
    const regressionG = g.append("g").attr("class","scatter-regression");
    const regressionLines = {};

    regions.forEach(region => {
      const regionData = rows.filter(d => d.region === region);
      const reg = linearRegression(regionData, d => d.renewPct, d => d.co2);
      if (!reg) return;

      const xMin = d3.min(regionData, d => d.renewPct);
      const xMax = d3.max(regionData, d => d.renewPct);
      const clamp = v => Math.max(0, Math.min(innerH, v));

      regressionLines[region] = regressionG.append("line")
        .attr("x1", xScale(xMin))
        .attr("y1", clamp(yScale(reg.slope * xMin + reg.intercept)))
        .attr("x2", xScale(xMax))
        .attr("y2", clamp(yScale(reg.slope * xMax + reg.intercept)))
        .attr("stroke",           REGION_COLORS[region])
        .attr("stroke-width",     2)
        .attr("stroke-dasharray", "6 3")
        .attr("opacity",          0.85);
    });

    // Smaller, more transparent dots to reduce overplotting
    const dotsG = g.append("g").attr("class","scatter-dots");

    const dots = dotsG.selectAll("circle")
      .data(rows)
      .join("circle")
        .attr("cx", d => xScale(d.renewPct))
        .attr("cy", d => yScale(d.co2))
        .attr("r", 3)                   
        .attr("fill",           d => REGION_COLORS[d.region])
        .attr("fill-opacity",   0.45)   
        .attr("stroke",         d => REGION_COLORS[d.region])
        .attr("stroke-width",   0.5)
        .attr("stroke-opacity", 0.3)
        .style("cursor","pointer");

    // Region + brush state 
    let activeRegions = new Set(regions);
    let brushedStates = null;

    function applyVisibility() {
      dots.attr("opacity", d => {
        const rOk = activeRegions.has(d.region);
        const bOk = brushedStates === null || brushedStates.has(d.state + d.year);
        return (rOk && bOk) ? 1 : 0.05;
      });
      // Show/hide regression lines to match active regions
      regions.forEach(r => {
        if (regressionLines[r]) {
          regressionLines[r].attr("opacity", activeRegions.has(r) ? 0.85 : 0);
        }
      });
    }

    // Legend buttons 
    const legendEl = d3.select("#scatter-legend");
    legendEl.append("span").attr("class","scatter-legend-label").text("Filter:");

    regions.forEach(r => {
      const btn = legendEl.append("button")
        .attr("class","scatter-legend-btn scatter-legend-btn--active")
        .attr("data-region", r)
        .on("click", function() {
          const reg = this.dataset.region;
          if (activeRegions.has(reg)) {
            if (activeRegions.size === 1) return;
            activeRegions.delete(reg);
            d3.select(this)
              .classed("scatter-legend-btn--active", false)
              .classed("scatter-legend-btn--dimmed", true);
          } else {
            activeRegions.add(reg);
            d3.select(this)
              .classed("scatter-legend-btn--active", true)
              .classed("scatter-legend-btn--dimmed", false);
          }
          applyVisibility();
        });
      btn.append("span").attr("class","scatter-swatch").style("background", REGION_COLORS[r]);
      btn.append("span").text(r);
    });

    legendEl.append("button")
      .attr("class","scatter-reset-btn")
      .text("Reset")
      .on("click", () => {
        activeRegions = new Set(regions);
        brushedStates = null;
        d3.selectAll(".scatter-legend-btn")
          .classed("scatter-legend-btn--active", true)
          .classed("scatter-legend-btn--dimmed", false);
        brushLayer.call(brush.move, null);
        applyVisibility();
        setBrushInfo(null);
      });

    // Tooltip events 
    dots
      .on("mousemove", function(event, d) {
        if (!activeRegions.has(d.region)) return;
        if (brushedStates !== null && !brushedStates.has(d.state + d.year)) return;
        showTT(event, d);
      })
      .on("mouseleave", hideTT);

    // Mini bar chart showing selected points by region 
    function updateBrushBar(sel) {
      const barWrap = document.getElementById("scatter-bar-wrap");
      const barSvg  = d3.select("#scatter-bar-svg");
      barSvg.selectAll("*").remove();

      if (!sel || sel.length === 0) {
        barWrap.style.display = "none";
        return;
      }

      barWrap.style.display = "block";

      const counts = regions.map(r => ({
        region: r,
        count:  sel.filter(d => d.region === r).length
      }));

      const bw = totalW - barMargin.left - barMargin.right;
      const bh = barH   - barMargin.top  - barMargin.bottom;
      const bg = barSvg.append("g")
        .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

      const xB = d3.scaleBand()
        .domain(regions).range([0, bw]).padding(0.35);

      const yB = d3.scaleLinear()
        .domain([0, d3.max(counts, d => d.count) * 1.15 || 1]).nice()
        .range([bh, 0]);

      // Grid
      bg.append("g").attr("class","scatter-grid")
        .call(d3.axisLeft(yB).ticks(4).tickSize(-bw).tickFormat(""))
        .call(ax => ax.select(".domain").remove());

      // Bars
      bg.selectAll("rect")
        .data(counts)
        .join("rect")
          .attr("x",      d => xB(d.region))
          .attr("y",      d => yB(d.count))
          .attr("width",  xB.bandwidth())
          .attr("height", d => bh - yB(d.count))
          .attr("fill",   d => REGION_COLORS[d.region])
          .attr("opacity", d => activeRegions.has(d.region) ? 0.82 : 0.15)
          .attr("rx", 3);

      // Count labels
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

      // Axes
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
        .attr("x", barMargin.left + bw / 2).attr("y", 12)
        .attr("text-anchor","middle")
        .style("font-weight","600").style("font-size","12px")
        .text("Selected Points by Region");
    }

 
    function setBrushInfo(selection) {
      const el = document.getElementById("scatter-brush-info");
      if (!selection) {
        brushedStates = null;
        el.innerHTML = "Drag on the chart to select a group of points";
        updateBrushBar(null);
        return;
      }
      const [[x0,y0],[x1,y1]] = selection;
      const sel = rows.filter(d => {
        const cx = xScale(d.renewPct), cy = yScale(d.co2);
        return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1
               && activeRegions.has(d.region);
      });
      if (sel.length === 0) {
        brushedStates = null;
        el.innerHTML = "No visible points in selection — try a different area";
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
      applyVisibility();
    }

    const brush = d3.brush()
      .extent([[0,0],[innerW,innerH]])
      .on("brush",  ({selection}) => { if (selection) setBrushInfo(selection); })
      .on("end",    ({selection}) => { if (!selection) setBrushInfo(null); });

    const brushLayer = g.append("g").attr("class","scatter-brush").call(brush);

    brushLayer.select(".selection")
      .style("fill",         "rgba(59,110,165,0.08)")
      .style("stroke",       "#3b6ea5")
      .style("stroke-width", "1.5");

    brushLayer.on("mousedown.tt", hideTT);

    applyVisibility();
  }
}
