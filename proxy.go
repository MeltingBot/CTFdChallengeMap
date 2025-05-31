package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
)

var (
	port    = flag.String("port", "3000", "Port to listen on")
	ctfdURL = flag.String("ctfd-url", "", "CTFd instance URL (can also use CTFD_URL env var)")
)

type Config struct {
	CTFdURL string `json:"ctfdUrl"`
}

func main() {
	flag.Parse()

	// Get CTFd URL from flag or environment
	targetURL := *ctfdURL
	if targetURL == "" {
		targetURL = os.Getenv("CTFD_URL")
	}
	if targetURL == "" {
		targetURL = "https://demo.ctfd.io"
	}

	// Parse target URL
	target, err := url.Parse(targetURL)
	if err != nil {
		log.Fatalf("Invalid CTFd URL: %v", err)
	}

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(target)
	
	// Modify the director to handle the path correctly
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = target.Host
		req.URL.Scheme = target.Scheme
		req.URL.Host = target.Host
		
		// Remove Origin header to avoid CORS issues
		req.Header.Del("Origin")
	}

	// Create file server for static files
	fs := http.FileServer(http.Dir("."))

	// Main handler
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Log the request
		log.Printf("%s %s", r.Method, r.URL.Path)

		// Handle /config endpoint
		if r.URL.Path == "/config" {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(Config{CTFdURL: targetURL})
			return
		}

		// Handle /api/* requests - proxy to CTFd
		if strings.HasPrefix(r.URL.Path, "/api") {
			// Add CORS headers for the response
			proxy.ServeHTTP(w, r)
			return
		}

		// Serve static files
		fs.ServeHTTP(w, r)
	})

	// Start server
	addr := fmt.Sprintf(":%s", *port)
	log.Printf("Proxy server started on http://localhost%s", addr)
	log.Printf("CTFd URL: %s", targetURL)
	
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}