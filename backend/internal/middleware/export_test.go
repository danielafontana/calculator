package middleware

// NewRateLimit exposes the bucket store to tests.
var NewRateLimit = newRateLimit

// Size returns the number of tracked clients.
func (b *buckets) Size() int {
	b.mu.Lock()
	defer b.mu.Unlock()

	return len(b.clients)
}
