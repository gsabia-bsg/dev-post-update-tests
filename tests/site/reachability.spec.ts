import { test, expect } from '@playwright/test';

test('il sito risponde 200 in HTTPS nonostante il certificato self-signed', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'nessuna risposta: baseURL o rete non configurate').not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(new URL(page.url()).protocol, 'i test devono girare in HTTPS, mai in HTTP').toBe('https:');
});
