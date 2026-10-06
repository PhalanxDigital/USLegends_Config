<script>
  import { onMount, untrack } from 'svelte';
  import { CarViewer } from '../viewer/CarViewer.js';
  import { PAINT_COLORS, USING_PLACEHOLDER_MODELS } from '../config/cars.js';
  import Icons from './Icons.svelte';

  /** build = { selections: { categoryId: optionId }, colorId } for the current car */
  let { car, build = $bindable(), onrequest } = $props();

  let host;
  let viewer = $state.raw(null);
  let loadedCarId = $state(null);
  let loading = $state({ loading: true, progress: 0 });
  let loadError = $state(false);
  let hotspots = $state([]);
  let activeCategoryId = $state(null); // desktop panel, opened from a hotspot
  let mobileStep = $state(0);
  let compact = $state(false); // phone layout (matches the original 480px breakpoint)

  const categories = $derived(car.categories);
  const activeCategory = $derived(categories.find((c) => c.id === activeCategoryId) ?? null);
  // Phones get a step-through carousel; color is the last step (the original hid color on phones).
  const steps = $derived([
    ...categories.map((c) => ({ key: c.id, title: c.title, category: c })),
    { key: 'color', title: 'Body Color', category: null },
  ]);
  const step = $derived(steps[Math.min(mobileStep, steps.length - 1)]);
  const paintFor = (colorId) => (PAINT_COLORS.find((c) => c.id === colorId) ?? PAINT_COLORS[0]).paint;

  onMount(() => {
    const mq = window.matchMedia('(max-width: 480px)');
    const sync = () => (compact = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    const v = new CarViewer(host, {
      onLoading: (s) => (loading = s),
      onHotspots: (h) => (hotspots = h),
      onError: (err) => {
        console.error(err);
        loadError = true;
      },
    });
    viewer = v;
    return () => {
      mq.removeEventListener('change', sync);
      v.dispose();
    };
  });

  // Switching cars: load that car's model, then apply its saved choices.
  $effect(() => {
    const v = viewer;
    const c = car;
    if (!v) return;
    untrack(() => {
      hotspots = [];
      activeCategoryId = null;
      mobileStep = 0;
      loadError = false;
      loadedCarId = null;
    });
    v.load(c).then((ok) => {
      if (ok) loadedCarId = c.id;
    });
  });

  // Any change to the choices (or a finished load) updates the 3D model.
  $effect(() => {
    const selections = $state.snapshot(build.selections);
    const color = paintFor(build.colorId);
    if (!viewer || loadedCarId !== car.id) return;
    viewer.applySelections(car, selections);
    viewer.setPaint(car, color);
  });

  function choose(category, option) {
    build.selections[category.id] = option.id;
  }
  function chooseColor(color) {
    build.colorId = color.id;
  }
  function stepBy(delta) {
    mobileStep = Math.max(0, Math.min(steps.length - 1, mobileStep + delta));
  }
</script>

<div class="configurator">
  <div class="viewer" bind:this={host}>
    {#if !compact && loadedCarId === car.id}
      {#each hotspots as spot (spot.id)}
        {@const cat = categories[spot.index]}
        {#if cat}
        <button
          class="hotspot"
          class:behind={spot.behind}
          class:active={activeCategoryId === spot.id}
          style="left: {spot.x}px; top: {spot.y}px"
          aria-label="{spot.index + 1}. {cat.title}"
          aria-expanded={activeCategoryId === spot.id}
          onclick={() => (activeCategoryId = spot.id)}
        >
          <span class="tip" aria-hidden="true">{cat.title}</span>
        </button>
        {/if}
      {/each}
    {/if}

    {#if loading.loading}
      <div class="status" role="status">
        <p>Loading 3D model{loading.progress ? ` ${Math.round(loading.progress * 100)}%` : '…'}</p>
        <div class="bar"><div style="width: {Math.round(loading.progress * 100)}%"></div></div>
      </div>
    {:else if loadError}
      <div class="status" role="alert"><p>The 3D model couldn't load. Please refresh the page.</p></div>
    {/if}

    {#if USING_PLACEHOLDER_MODELS}
      <p class="placeholder-note">Placeholder 3D model · final models pending</p>
    {/if}
  </div>

  {#if !compact && categories.length}
    <aside class="controls" aria-live="polite">
      {#if activeCategory}
        <h3>{activeCategory.title}</h3>
        {#each activeCategory.options as option (option.id)}
          {@const isOn = build.selections[activeCategory.id] === option.id}
          <button class:selected={isOn} aria-pressed={isOn} onclick={() => choose(activeCategory, option)}>
            {#if option.thumb}<img src={option.thumb} alt="" />{/if}
            {option.label}
          </button>
        {/each}
      {:else}
        <p class="hint">Click a hotspot on the car to change its parts.</p>
      {/if}
    </aside>
  {/if}

  {#if compact}
    <div class="scroll-buttons">
      <button aria-label="Previous" disabled={mobileStep === 0} onclick={() => stepBy(-1)}><Icons name="left" /></button>
      <p>{step.title} <span class="fraction">({mobileStep + 1}/{steps.length})</span></p>
      <button aria-label="Next" disabled={mobileStep === steps.length - 1} onclick={() => stepBy(1)}><Icons name="right" /></button>
    </div>
    <div class="mobile-controls">
      {#if step.category}
        {#each step.category.options as option (option.id)}
          {@const isOn = build.selections[step.category.id] === option.id}
          <button class:selected={isOn} aria-pressed={isOn} onclick={() => choose(step.category, option)}>{option.label}</button>
        {/each}
      {:else}
        <div class="picker">
          {#each PAINT_COLORS as color (color.id)}
            <button
              class="swatch"
              class:selected-color={build.colorId === color.id}
              aria-label={color.label}
              aria-pressed={build.colorId === color.id}
              onclick={() => chooseColor(color)}
            >
              <span style="background-color: {color.swatch}"></span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="button-bar">
    <button class="submit-btn" onclick={onrequest}>Request a build <Icons name="arrows" size={14} /></button>
  </div>
</div>

<div class="three-sixty-label">
  <Icons name="360" />
  <span class="mobile-hidden"><p>Drag car to rotate</p></span>
</div>

{#if !compact}
  <div class="color-picker">
    <div>
      <p id="body-color-label">Body Color</p>
      <div class="picker" role="group" aria-labelledby="body-color-label">
        {#each PAINT_COLORS as color (color.id)}
          <button
            class="swatch"
            class:selected-color={build.colorId === color.id}
            aria-label={color.label}
            aria-pressed={build.colorId === color.id}
            onclick={() => chooseColor(color)}
          >
            <span style="background-color: {color.swatch}"></span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .configurator {
    position: relative;
    height: 85%;
    width: 100%;
  }
  .viewer {
    position: relative;
    width: 98%;
    height: 98%;
    margin: 0 auto;
    overflow: hidden;
    border-bottom-left-radius: 15px;
    border-bottom-right-radius: 15px;
    cursor: grab;
  }
  .viewer:active {
    cursor: grabbing;
  }

  /* hotspot dots: white rings like the Sketchfab annotations */
  .hotspot {
    position: absolute;
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    padding: 0;
    border-radius: 50%;
    border: 3px solid #fff;
    background: rgba(21, 22, 22, 0.25);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    transition: opacity 0.2s, transform 0.15s, background-color 0.15s;
    z-index: 2;
  }
  .hotspot:hover,
  .hotspot:focus-visible {
    transform: scale(1.15);
    background: rgba(245, 53, 41, 0.45);
    outline: none;
  }
  .hotspot.active {
    background: rgb(245, 53, 41);
  }
  .hotspot.behind {
    opacity: 0.3;
  }
  .hotspot .tip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    transform: translateX(-50%);
    white-space: nowrap;
    background: #2a2a2a;
    color: #ebebeb;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 6px 10px;
    border-radius: 5px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .hotspot:hover .tip,
  .hotspot:focus-visible .tip {
    opacity: 1;
  }

  .status {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    pointer-events: none;
  }
  .status p {
    margin: 0;
    font-size: 14px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #bebebe;
  }
  .bar {
    width: 180px;
    height: 2px;
    background: rgba(229, 229, 229, 0.2);
  }
  .bar div {
    height: 100%;
    background: rgb(245, 53, 41);
    transition: width 0.2s;
  }
  .placeholder-note {
    position: absolute;
    top: 12px;
    left: 16px;
    margin: 0;
    padding: 5px 10px;
    border: 1px solid rgba(229, 229, 229, 0.2);
    border-radius: 999px;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(235, 235, 235, 0.6);
    pointer-events: none;
  }

  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px;
    box-sizing: border-box;
    position: absolute;
    top: 0;
    right: 0;
    height: calc(100% - 130px); /* stop above the color picker */
    width: 10%;
    min-width: 150px;
    z-index: 3;
  }
  .controls > button {
    width: 100%;
    margin: 10px 0;
    background-color: rgba(229, 229, 229, 0.2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 12px;
  }
  .controls img {
    width: 100%;
    height: auto;
    max-height: 11vh;
    object-fit: contain;
  }
  .hint {
    font-size: 13px;
    line-height: 1.5;
    text-align: center;
    color: rgba(235, 235, 235, 0.55);
  }

  .button-bar {
    position: absolute;
    bottom: 5%;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 3;
  }
  .button-bar > button {
    display: grid;
    grid-template-columns: 1fr 20%;
    align-items: center;
    justify-items: center;
    min-width: 250px;
    font-size: 16px;
    pointer-events: auto;
    background: rgba(21, 22, 22, 0.6);
  }

  .color-picker {
    display: flex;
    gap: 10px;
    position: absolute;
    bottom: 5%;
    right: 5%;
    z-index: 3;
  }
  .color-picker p {
    margin: 0 0 8px;
  }
  .picker {
    border: 1px solid rgba(229, 229, 229, 0.2);
    border-radius: 5px;
    display: flex;
    padding: 10px;
  }
  .swatch {
    height: 38px;
    width: 38px;
    border-radius: 50%;
    background-color: #151616;
    margin: 0 10px;
    padding: 0;
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .swatch span {
    display: block;
    height: 26px;
    width: 26px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
  }
  .swatch.selected-color {
    border: 1px solid rgba(229, 229, 229, 0.6);
  }
  .swatch:focus-visible {
    outline: 2px solid rgb(245, 53, 41);
    outline-offset: 2px;
  }

  .three-sixty-label {
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    bottom: 5%;
    left: 5%;
    pointer-events: none;
    z-index: 3;
  }
  .three-sixty-label p {
    margin-left: 20px;
  }

  .mobile-controls {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: start;
    justify-content: center;
    padding: 10px;
    box-sizing: border-box;
    gap: 10px;
  }
  .mobile-controls > button {
    padding: 10px 20px;
  }
  .mobile-controls .picker {
    border: none;
    padding: 0;
  }
  .mobile-controls .swatch {
    margin: 0 4px;
  }
  .fraction {
    color: rgba(235, 235, 235, 0.25);
  }
  .scroll-buttons {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 90%;
    margin: 0 auto;
  }
  .scroll-buttons > button {
    padding: 12px;
    border: none;
    background: none;
  }
  .scroll-buttons > button:disabled {
    opacity: 0.3;
  }

  .selected {
    border: 1px solid rgb(245, 53, 41);
    background-color: rgba(245, 53, 41, 0.3) !important;
  }

  @media (max-width: 480px) {
    .configurator {
      height: auto;
    }
    .viewer {
      height: 52vh;
    }
    .placeholder-note {
      left: auto;
      right: 12px;
      font-size: 10px;
    }
    .three-sixty-label {
      top: 17%;
      bottom: initial;
    }
    .mobile-hidden {
      display: none;
    }
    .button-bar {
      position: static;
      margin-top: 8px;
    }
    .button-bar > button {
      padding: 15px;
    }
  }
</style>
