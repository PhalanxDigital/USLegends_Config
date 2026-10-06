<script>
  import { CARS, DEFAULT_CAR_ID, PAINT_COLORS, defaultSelections } from './lib/config/cars.js';
  import Configurator from './lib/components/Configurator.svelte';
  import RequestForm from './lib/components/RequestForm.svelte';
  import Icons from './lib/components/Icons.svelte';

  const MESSAGES = {
    ok: 'Thank you for your submission, someone from our team will contact you shortly.',
    error: 'There was an error with your request, please try again later.',
    preview: 'Preview mode: nothing was sent. On the live site, this request goes to the US Legends team.',
    dryRun: 'Test mode: nothing was sent because LEAD_ENDPOINT_URL is not set. Your request looked complete.',
  };

  let carId = $state(DEFAULT_CAR_ID);
  const car = $derived(CARS.find((c) => c.id === carId) ?? CARS[0]);

  // Each car keeps its own choices while you switch tabs.
  let builds = $state(
    Object.fromEntries(CARS.map((c) => [c.id, { selections: defaultSelections(c), colorId: PAINT_COLORS[0].id }])),
  );

  let formOpen = $state(false);
  let message = $state('');

  function onresult(result) {
    formOpen = false;
    message = result.preview ? MESSAGES.preview : result.dryRun ? MESSAGES.dryRun : result.ok ? MESSAGES.ok : MESSAGES.error;
  }
</script>

<main>
  <div class="container">
    <header class="control-bar">
      <h2>3d Car Builder</h2>
      <nav class="button-bar" aria-label="Choose a car">
        {#each CARS as c (c.id)}
          <button class:selected={carId === c.id} aria-pressed={carId === c.id} onclick={() => (carId = c.id)}>{c.tabLabel}</button>
        {/each}
      </nav>
      <div class="mobile-dropdown">
        <select bind:value={carId} aria-label="Choose a car">
          {#each CARS as c (c.id)}<option value={c.id}>{c.tabLabel}</option>{/each}
        </select>
      </div>
    </header>
    <Configurator {car} bind:build={builds[carId]} onrequest={() => (formOpen = true)} />
  </div>

  {#if formOpen}
    <RequestForm {car} build={builds[carId]} onclose={() => (formOpen = false)} {onresult} />
  {/if}

  {#if message}
    <div class="thank-you-message" role="status">
      <button onclick={() => (message = '')} class="close" aria-label="Close"><Icons name="close" /></button>
      <h3>{message}</h3>
    </div>
  {/if}
</main>

<style>
  main {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    height: 100dvh;
  }
  .container {
    height: 95%;
    width: 100vw;
    border: 1px solid rgba(229, 229, 229, 0.2);
    border-radius: 15px;
    position: relative;
    overflow: hidden;
  }
  .control-bar {
    height: 15%;
    min-height: 64px;
    box-sizing: border-box;
    border-bottom: 1px solid rgba(229, 229, 229, 0.2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    position: relative;
    z-index: 5;
  }
  .button-bar {
    display: flex;
    gap: 8px;
  }
  .mobile-dropdown {
    display: none;
  }
  select {
    border: 1px solid rgba(229, 229, 229, 0.2);
    background: #151616;
    padding: 8px;
    color: #ebebeb;
    border-radius: 5px;
    font-family: inherit;
  }
  h2 {
    font-size: clamp(1.5rem, 1.2rem + 1.5vw, 3rem);
    font-weight: 400;
    line-height: clamp(1.5rem, 1.2rem + 1.5vw, 3rem);
    letter-spacing: -0.04em;
    text-transform: uppercase;
    color: #ebebeb;
    margin: 0;
  }
  .selected {
    border: 1px solid rgb(245, 53, 41);
    background-color: rgba(245, 53, 41, 0.3) !important;
  }
  .thank-you-message {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, 88vw);
    box-sizing: border-box;
    background-color: #2a2a2a;
    padding: 48px 56px 40px 32px;
    border-radius: 15px;
    z-index: 30;
  }
  .thank-you-message h3 {
    margin: 0;
    line-height: 1.4;
  }
  .close {
    position: absolute;
    border: none;
    background: none;
    right: 12px;
    top: 12px;
    padding: 0;
  }
  @media (max-width: 950px) {
    .mobile-dropdown {
      display: block;
    }
    .button-bar {
      display: none;
    }
  }
  @media (max-width: 480px) {
    .container {
      overflow-y: auto;
    }
  }
</style>
