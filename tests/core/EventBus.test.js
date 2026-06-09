import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import fs from 'fs';
import path from 'path';

describe('EventBus', () => {
    const TEMP_DIR = path.join(process.cwd(), 'tmp_event');
    const TEMP_FILE = path.join(TEMP_DIR, 'sys_events.json');

    beforeEach(() => {
        // Cleanup vor jedem Test
        if (fs.existsSync(TEMP_FILE)) {
            fs.unlinkSync(TEMP_FILE);
        }
    });

    afterEach(() => {
        if (fs.existsSync(TEMP_FILE)) {
            fs.unlinkSync(TEMP_FILE);
        }
    });

    it('sollte ein Event korrekt in die sys_events.json schreiben', () => {
        EventBus.emit('TestController', 'test_event', { foo: 'bar' });

        expect(fs.existsSync(TEMP_FILE)).toBe(true);

        const content = JSON.parse(fs.readFileSync(TEMP_FILE, 'utf-8'));
        expect(content.length).toBe(1);
        expect(content[0].source).toBe('TestController');
        expect(content[0].type).toBe('test_event');
        expect(content[0].details.foo).toBe('bar');
        expect(content[0].timestamp).toBeDefined();
    });

    it('sollte mehrere Events an das Array anhängen', () => {
        EventBus.emit('Ctrl1', 'event1', { id: 1 });
        EventBus.emit('Ctrl2', 'event2', { id: 2 });

        const content = JSON.parse(fs.readFileSync(TEMP_FILE, 'utf-8'));
        expect(content.length).toBe(2);
        expect(content[0].source).toBe('Ctrl1');
        expect(content[1].source).toBe('Ctrl2');
    });
});
