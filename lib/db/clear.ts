import { config } from 'dotenv';
config();

async function clear() {
  const { db } = await import('./index');
  const { leads, signals, events, campaigns, templates, experiments } = await import('./schema');

  await db.delete(events);
  await db.delete(signals);
  await db.delete(experiments);
  await db.delete(templates);
  await db.delete(campaigns);
  await db.delete(leads);

  console.log('All data cleared.');
}

clear().catch((e) => { console.error(e); process.exit(1); });
