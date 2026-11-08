<template>
  <div class="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,32rem)]">
    <aside class="relative hidden flex-col justify-between overflow-hidden border-e border-default bg-[var(--color-moss-950)] p-10 text-[var(--color-moss-100)] lg:flex">
      <AppLogo class="text-[var(--color-moss-50)]" />
      <div class="max-w-md">
        <p class="log-line text-[0.82rem] leading-7 text-[var(--color-moss-400)]">
          GET /orders/<span class="text-[var(--color-tide-300)]">10293</span> returned <span class="text-[#efb85a]">200</span>
          in <span class="text-[#efb85a]">84</span> ms
        </p>
        <p class="mt-6 text-2xl font-medium leading-snug tracking-[-0.01em]">
          The same message, a thousand times a day. LogsTrace keeps the parts that change.
        </p>
      </div>
      <p class="text-sm text-[var(--color-moss-500)]">
        Sessions are stored server-side and can be signed out from any device.
      </p>
    </aside>
    <div class="flex flex-col px-5 py-8 sm:px-10">
      <AppLogo class="lg:hidden" />
      <div class="mx-auto my-auto w-full max-w-sm py-10">
        <slot />
      </div>
    </div>
  </div>
</template>
