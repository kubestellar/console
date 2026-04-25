import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeFederationAction } from '../useFederationActions'
import type { ActionRequest, ActionResult } from '../useFederationActions'
import { STORAGE_KEY_TOKEN } from '../../lib/constants'
import { LOCAL_AGENT_HTTP_URL } from '../../lib/constants/network'

describe('executeFederationAction', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('sends a POST request with the correct headers and body', async () => {
        const token = 'test-token'
        localStorage.setItem(STORAGE_KEY_TOKEN, token)

        const req: ActionRequest = {
            actionId: 'ocm.approveCSR',
            provider: 'ocm',
            hubContext: 'hub-1',
            clusterName: 'cluster-a',
            payload: { foo: 'bar' },
        }

        const mockResponse: ActionResult = { ok: true, already: false }
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => mockResponse,
        })
        vi.stubGlobal('fetch', mockFetch)

        const result = await executeFederationAction(req)

        expect(mockFetch).toHaveBeenCalledWith(
            `${LOCAL_AGENT_HTTP_URL}/federation/action`,
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(req),
            })
        )
        expect(result).toEqual(mockResponse)
    })

    it('handles missing auth token gracefully', async () => {
        // No token in localStorage
        const req: ActionRequest = {
            actionId: 'test-action',
            provider: 'ocm',
            hubContext: 'ctx',
        }

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, already: false }),
        })
        vi.stubGlobal('fetch', mockFetch)

        await executeFederationAction(req)

        expect(mockFetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            })
        )
    })

    it('returns ok: false and error message when response is not ok', async () => {
        const errorText = 'Internal Server Error'
        const mockFetch = vi.fn().mockResolvedValue({
            ok: false,
            text: async () => errorText,
        })
        vi.stubGlobal('fetch', mockFetch)

        const result = await executeFederationAction({
            actionId: 'fail',
            provider: 'ocm',
            hubContext: 'ctx',
        })

        expect(result).toEqual({ ok: false, already: false, message: errorText })
    })

    it('handles network exceptions by throwing', async () => {
        const networkError = new Error('Network failure')
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))

        await expect(executeFederationAction({
            actionId: 'err',
            provider: 'ocm',
            hubContext: 'ctx',
        })).rejects.toThrow('Network failure')
    })
})
