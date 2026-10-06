<script>
  // Icons carried over from the original build, inlined so they work in every build.
  let { name, color = 'currentColor', size } = $props();
</script>

{#if name === 'arrows'}
  <svg width={size ?? 11} height={size ? (size * 8) / 11 : 8} viewBox="0 0 11 8" fill="none" aria-hidden="true">
    <path d="M0 7.19L1.009 8L6 4L1.009 0L0 .81L3.978 4L0 7.19Z" fill={color === 'currentColor' ? '#FF3528' : color} />
    <path d="M6 7.19L6.841 8L11 4L6.841 0L6 .81L9.315 4L6 7.19Z" fill={color === 'currentColor' ? '#FF3528' : color} />
  </svg>
{:else if name === 'left'}
  <svg width="11" height="8" viewBox="0 0 11 8" fill="none" aria-hidden="true">
    <path d="M11 7.19L9.991 8L5 4L9.991 0L11 .81L7.022 4L11 7.19Z" fill="#EBEBEB" />
    <path d="M5 7.19L4.159 8L0 4L4.159 0L5 .81L1.685 4L5 7.19Z" fill="#EBEBEB" />
  </svg>
{:else if name === 'right'}
  <svg width="11" height="8" viewBox="0 0 11 8" fill="none" aria-hidden="true">
    <path d="M0 7.19L1.009 8L6 4L1.009 0L0 .81L3.978 4L0 7.19Z" fill="#EBEBEB" />
    <path d="M6 7.19L6.841 8L11 4L6.841 0L6 .81L9.315 4L6 7.19Z" fill="#EBEBEB" />
  </svg>
{:else if name === 'close'}
  <svg width={size ?? 35} height={size ?? 35} viewBox="0 0 35 35" aria-hidden="true">
    <path
      d="M26.69 8.33a1.45 1.45 0 0 0-2.06 0L17.5 15.44l-7.13-7.13a1.46 1.46 0 1 0-2.06 2.06l7.13 7.13-7.13 7.13a1.46 1.46 0 1 0 2.06 2.06l7.13-7.13 7.13 7.13a1.46 1.46 0 1 0 2.06-2.06l-7.13-7.13 7.13-7.13c.55-.55.55-1.49 0-2.04Z"
      fill="#ffffff"
    />
  </svg>
{:else if name === '360'}
  <svg width="36" height="26" viewBox="0 0 36 26" fill="none" aria-hidden="true">
    <path d="M29.366 10.804a.75.75 0 0 0-.412 1.443c3.423.978 5.55 2.399 5.55 3.706 0 .956-1.164 2.006-3.192 2.88-2.231.961-5.397 1.665-8.917 1.982l-3.072-.042a.75.75 0 0 0-.02 1.5l3.11.042h.077c3.69-.329 7.033-1.075 9.415-2.102C35.292 18.75 36.003 17.09 36.003 15.953c0-2.096-2.357-3.924-6.637-5.149Z" fill="#EBEBEB" />
    <path d="M7.266 9.95a.75.75 0 0 0 0 1.5h3.084v3.1H7.266a.75.75 0 0 0 0 1.5H11.1a.75.75 0 0 0 .75-.75V6.1a.75.75 0 0 0-.75-.75H7.266a.75.75 0 0 0 0 1.5h3.084v3.1H7.266Z" fill="#EBEBEB" />
    <path d="M14.164 16.05h4.6a.75.75 0 0 0 .75-.75v-4.6a.75.75 0 0 0-.75-.75h-3.85v-3.1h3.084a.75.75 0 0 0 0-1.5h-3.834a.75.75 0 0 0-.75.75v9.2c0 .414.336.75.75.75Zm.75-4.6h3.1v3.1h-3.1v-3.1Z" fill="#EBEBEB" />
    <path d="M21.836 16.05h4.6a.75.75 0 0 0 .75-.75V6.1a.75.75 0 0 0-.75-.75h-4.6a.75.75 0 0 0-.75.75v9.2c0 .414.336.75.75.75Zm.75-9.2h3.1v7.7h-3.1v-7.7Z" fill="#EBEBEB" />
    <path d="M13.714 17.915a.75.75 0 1 0-1.145.969l1.678 1.983c-3.54-.27-6.746-.919-9.103-1.849C2.828 18.104 1.5 16.987 1.5 15.953c0-1.202 1.78-2.496 4.762-3.464a.75.75 0 0 0-.463-1.427c-1.735.563-3.11 1.232-4.089 1.99C.576 13.93 0 14.907 0 15.952c0 1.733 1.588 3.276 4.593 4.461 2.442.964 5.717 1.64 9.317 1.932l-1.496 1.658a.75.75 0 1 0 1.114 1.005l2.729-3.024a.75.75 0 0 0 .193-.502v-.057a.75.75 0 0 0-.177-.485l-2.559-3.024Z" fill="#EBEBEB" />
    <path d="M28.61 5.311h3.065a.75.75 0 0 0 .75-.75V1.494a.75.75 0 0 0-.75-.75H28.61a.75.75 0 0 0-.75.75v3.067c0 .414.335.75.75.75Zm.75-3.067h1.565v1.567H29.36V2.244Z" fill="#EBEBEB" />
  </svg>
{/if}
