import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * NOTEStandard Mobile Web & PWA Responsiveness Audit Suite
 * Verifies mobile navigation, responsive CSS classes, safe area insets,
 * touch targets, and viewport settings across core dashboard components.
 */
describe('NOTEStandard Mobile Web & PWA Responsiveness', () => {
  const rootDir = path.resolve(__dirname, '../..');

  it('index.html must specify viewport-fit=cover for iOS safe-area handling', () => {
    const filePath = path.join(rootDir, 'index.html');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('viewport-fit=cover');
    expect(content).toContain('interactive-widget=resizes-content');
    expect(content).toContain('apple-mobile-web-app-capable');
  });

  it('manifest.json must specify display standalone and portrait orientation', () => {
    const filePath = path.join(rootDir, 'public/manifest.json');
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);

    expect(json.display).toBe('standalone');
    expect(json.orientation).toBe('portrait');
  });

  it('MobileBottomNav.tsx must be created and contain primary routes with touch targets', () => {
    const filePath = path.join(rootDir, 'src/components/layout/MobileBottomNav.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('/dashboard');
    expect(content).toContain('/dashboard/wallet');
    expect(content).toContain('/dashboard/chat');
    expect(content).toContain('/dashboard/feed');
    expect(content).toContain('min-h-[44px]');
    expect(content).toContain('pb-safe');
  });

  it('DashboardLayout.tsx must render MobileBottomNav and apply responsive mobile padding', () => {
    const filePath = path.join(rootDir, 'src/components/layout/DashboardLayout.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('MobileBottomNav');
    expect(content).toContain('pb-20 lg:pb-8');
    expect(content).toContain('min-w-[44px]');
  });

  it('Transactions.tsx must provide a dedicated mobile card list view for small screens', () => {
    const filePath = path.join(rootDir, 'src/pages/dashboard/Transactions.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('hidden md:block');
    expect(content).toContain('md:hidden');
  });

  it('Billing.tsx currency toggle must support flex-wrap for small screen viewports', () => {
    const filePath = path.join(rootDir, 'src/pages/dashboard/Billing.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    expect(content).toContain('flex-wrap');
  });
});
