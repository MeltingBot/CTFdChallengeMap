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
	port         = flag.String("port", "3000", "Port to listen on")
	ctfdURL      = flag.String("ctfd-url", "", "CTFd instance URL (can also use CTFD_URL env var)")
	currentURL   string
	currentProxy *httputil.ReverseProxy
)

type Config struct {
	CTFdURL string `json:"ctfdUrl"`
}

type ConfigUpdate struct {
	CTFdURL string `json:"ctfdUrl"`
}

// createProxy creates a new reverse proxy for the given URL
func createProxy(targetURL string) (*httputil.ReverseProxy, error) {
	target, err := url.Parse(targetURL)
	if err != nil {
		return nil, err
	}

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
	
	return proxy, nil
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

	// Initialize current URL and proxy
	currentURL = targetURL
	var err error
	currentProxy, err = createProxy(currentURL)
	if err != nil {
		log.Fatalf("Invalid CTFd URL: %v", err)
	}

	// Create file server for static files
	fs := http.FileServer(http.Dir("."))

	// Main handler
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Log the request
		log.Printf("%s %s", r.Method, r.URL.Path)

		// Handle /config endpoint
		if r.URL.Path == "/config" {
			if r.Method == "GET" {
				// Return current configuration
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(Config{CTFdURL: currentURL})
				return
			} else if r.Method == "POST" {
				// Update configuration
				var update ConfigUpdate
				if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
					http.Error(w, "Invalid JSON", http.StatusBadRequest)
					return
				}
				
				if update.CTFdURL == "" {
					http.Error(w, "URL CTFd invalide", http.StatusBadRequest)
					return
				}
				
				// Create new proxy with the new URL
				newProxy, err := createProxy(update.CTFdURL)
				if err != nil {
					http.Error(w, "URL CTFd invalide: "+err.Error(), http.StatusBadRequest)
					return
				}
				
				// Update current URL and proxy
				currentURL = update.CTFdURL
				currentProxy = newProxy
				log.Printf("URL CTFd mise à jour: %s", currentURL)
				
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success": true,
					"ctfdUrl": currentURL,
				})
				return
			}
		}

		// Handle /api/* requests - proxy to CTFd
		if strings.HasPrefix(r.URL.Path, "/api") {
			// Use current proxy
			currentProxy.ServeHTTP(w, r)
			return
		}

		// Serve static files
		fs.ServeHTTP(w, r)
	})

	// Start server
	addr := fmt.Sprintf(":%s", *port)
	log.Printf("Proxy server started on http://localhost%s", addr)
	log.Printf("CTFd URL: %s", currentURL)
	
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}