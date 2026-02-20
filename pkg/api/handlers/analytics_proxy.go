package handlers

import (
	"bytes"
	"io"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
)

var ga4Client = &http.Client{Timeout: 10 * time.Second}

// GA4ScriptProxy proxies the gtag.js script through the console's own domain
// so that ad blockers do not block it.
func GA4ScriptProxy(c *fiber.Ctx) error {
	target := "https://www.googletagmanager.com/gtag/js?" + string(c.Context().QueryArgs().QueryString())
	resp, err := ga4Client.Get(target)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	defer resp.Body.Close()
	c.Set("Content-Type", resp.Header.Get("Content-Type"))
	c.Set("Cache-Control", "public, max-age=3600")
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	return c.Status(resp.StatusCode).Send(body)
}

// GA4CollectProxy proxies GA4 event collection requests through the console's
// own domain so that ad blockers do not block them.
func GA4CollectProxy(c *fiber.Ctx) error {
	target := "https://www.google-analytics.com/g/collect?" + string(c.Context().QueryArgs().QueryString())
	req, err := http.NewRequest(c.Method(), target, bytes.NewReader(c.Body()))
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	req.Header.Set("Content-Type", c.Get("Content-Type", "text/plain"))
	req.Header.Set("User-Agent", c.Get("User-Agent"))
	resp, err := ga4Client.Do(req)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	return c.Status(resp.StatusCode).Send(body)
}
