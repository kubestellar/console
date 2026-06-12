package feedback

import "github.com/gofiber/fiber/v2"

func extractClientAuth(c *fiber.Ctx) string {
	if cookieValue := c.Cookies(clientAuthCookieName); cookieValue != "" {
		return cookieValue
	}
	return c.Get("X-KC-Client-Auth")
}
