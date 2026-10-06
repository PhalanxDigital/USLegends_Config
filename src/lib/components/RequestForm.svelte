<script>
  import { onMount } from 'svelte';
  import Icons from './Icons.svelte';
  import { buildLeadPayload, submitLead } from '../lead.js';

  let { car, build, onclose, onresult } = $props();

  let customer = $state({ firstName: '', lastName: '', address: '', address2: '', city: '', state: '', zip: '', phone: '', email: '' });
  let consent = $state(false);
  let sending = $state(false);
  let firstField;

  onMount(() => firstField?.focus());

  async function submit(event) {
    event.preventDefault(); // the old form let the browser reload the page mid-send
    if (sending) return;
    sending = true;
    const result = await submitLead(buildLeadPayload(car, build, customer));
    sending = false;
    onresult(result);
  }

  function onkeydown(e) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window {onkeydown} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="request-title">
    <button class="close" onclick={onclose} aria-label="Close"><Icons name="close" /></button>
    <h2 id="request-title">Request Info</h2>
    <p class="summary">{car.tabLabel}</p>
    <hr />
    <form onsubmit={submit}>
      <input bind:this={firstField} type="text" required autocomplete="given-name" bind:value={customer.firstName} placeholder="First Name *" aria-label="First name" />
      <input type="text" required autocomplete="family-name" bind:value={customer.lastName} placeholder="Last Name *" aria-label="Last name" />
      <input type="text" required autocomplete="address-line1" bind:value={customer.address} placeholder="Address *" aria-label="Address" />
      <input type="text" autocomplete="address-line2" bind:value={customer.address2} placeholder="Address 2" aria-label="Address line 2" />
      <input type="text" required autocomplete="address-level2" bind:value={customer.city} placeholder="City *" aria-label="City" />
      <input type="text" required autocomplete="address-level1" bind:value={customer.state} placeholder="State *" aria-label="State" />
      <input type="text" required autocomplete="postal-code" inputmode="numeric" bind:value={customer.zip} placeholder="ZIP *" aria-label="ZIP code" />
      <input type="tel" required autocomplete="tel" bind:value={customer.phone} placeholder="Phone *" aria-label="Phone" />
      <input type="email" required autocomplete="email" bind:value={customer.email} placeholder="Email *" aria-label="Email" />
      <div class="form-button-bar">
        <label class="consent">
          <input type="checkbox" required bind:checked={consent} />
          I am 18 years or older and consent to being contacted *
        </label>
        <button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Submit'} <Icons name="arrows" size={14} /></button>
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    z-index: 20;
  }
  .dialog {
    position: relative;
    background: #2a2a2a;
    color: white;
    width: 80%;
    max-width: 1100px;
    padding: 5%;
    box-sizing: border-box;
    border-radius: 15px;
    max-height: 80vh;
    overflow: auto;
  }
  .close {
    position: absolute;
    border: none;
    background: none;
    right: 4%;
    top: 4%;
    padding: 0;
  }
  h2 {
    margin: 0;
  }
  .summary {
    margin: 8px 0 0;
    font-size: 13px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(235, 235, 235, 0.55);
  }
  hr {
    opacity: 0.2;
    background: #ebebeb;
    margin: 36px 0;
  }
  form {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    column-gap: 14px;
    row-gap: 26px;
  }
  form > input {
    border-radius: 4px;
    border: 1px solid rgba(235, 235, 235, 0.2);
    background: none;
    height: 40px;
    color: #ebebeb;
    padding-left: 10px;
    font-family: inherit;
    font-size: 14px;
  }
  form > input:focus {
    outline: none;
    border-color: rgb(245, 53, 41);
  }
  input::placeholder {
    color: #bebebe;
    opacity: 1;
  }
  .form-button-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    grid-column: span 3;
    gap: 20px;
  }
  .consent {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  .consent input {
    accent-color: rgb(245, 53, 41);
    width: 18px;
    height: 18px;
  }
  .form-button-bar > button {
    display: grid;
    grid-template-columns: 1fr 20%;
    align-items: center;
    justify-items: center;
    min-width: 170px;
    font-size: 16px;
  }
  .form-button-bar > button:disabled {
    opacity: 0.6;
    cursor: progress;
  }
  @media (max-width: 950px) {
    .backdrop {
      padding-top: 6vh;
    }
    .dialog {
      width: 92%;
      max-height: 86vh;
    }
    form {
      display: flex;
      flex-direction: column;
    }
    .form-button-bar {
      flex-direction: column;
      align-items: flex-start;
      gap: 30px;
    }
  }
</style>
