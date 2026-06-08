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
	"sync"
	"time"
)

var (
	port    = flag.String("port", "3000", "Port to listen on")
	host    = flag.String("host", "127.0.0.1", "Interface to bind to (use 0.0.0.0 to expose on LAN)")
	ctfdURL = flag.String("ctfd-url", "", "CTFd instance URL (can also use CTFD_URL env var)")

	proxyMu      sync.RWMutex
	currentURL   string
	currentProxy *httputil.ReverseProxy
)

type Config struct {
	CTFdURL string `json:"ctfdUrl"`
}

type ConfigUpdate struct {
	CTFdURL string `json:"ctfdUrl"`
}

type HealthResponse struct {
	Status    string `json:"status"`
	Proxy     string `json:"proxy"`
	Target    string `json:"target"`
	Timestamp string `json:"timestamp"`
}

// validateTargetURL ensures the URL is a well-formed http(s) URL with a host.
func validateTargetURL(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return nil, fmt.Errorf("scheme must be http or https")
	}
	if u.Host == "" {
		return nil, fmt.Errorf("missing host")
	}
	return u, nil
}

// createProxy creates a new reverse proxy for the given URL
func createProxy(targetURL string) (*httputil.ReverseProxy, error) {
	target, err := validateTargetURL(targetURL)
	if err != nil {
		return nil, err
	}

	proxy := httputil.NewSingleHostReverseProxy(target)

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

func getProxy() (*httputil.ReverseProxy, string) {
	proxyMu.RLock()
	defer proxyMu.RUnlock()
	return currentProxy, currentURL
}

func setProxy(p *httputil.ReverseProxy, u string) {
	proxyMu.Lock()
	defer proxyMu.Unlock()
	currentProxy = p
	currentURL = u
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

	p, err := createProxy(targetURL)
	if err != nil {
		log.Fatalf("Invalid CTFd URL: %v", err)
	}
	setProxy(p, targetURL)

	fs := http.FileServer(http.Dir("."))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)

		// Security headers (mêmes valeurs que proxy-server.js)
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self' 'unsafe-inline'; "+
				"style-src 'self' 'unsafe-inline'; "+
				"img-src 'self' data:; "+
				"connect-src 'self'; "+
				"font-src 'self' data:; "+
				"object-src 'none'; "+
				"base-uri 'self'; "+
				"frame-ancestors 'none'; "+
				"form-action 'self'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

		if r.URL.Path == "/health" {
			_, target := getProxy()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(HealthResponse{
				Status:    "ok",
				Proxy:     "running",
				Target:    target,
				Timestamp: time.Now().Format(time.RFC3339),
			})
			return
		}

		if r.URL.Path == "/config" {
			if r.Method == "GET" {
				_, target := getProxy()
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(Config{CTFdURL: target})
				return
			} else if r.Method == "POST" {
				var update ConfigUpdate
				if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
					http.Error(w, "Invalid JSON", http.StatusBadRequest)
					return
				}

				if update.CTFdURL == "" {
					http.Error(w, "URL CTFd invalide", http.StatusBadRequest)
					return
				}

				newProxy, err := createProxy(update.CTFdURL)
				if err != nil {
					http.Error(w, "URL CTFd invalide: "+err.Error(), http.StatusBadRequest)
					return
				}

				setProxy(newProxy, update.CTFdURL)
				log.Printf("URL CTFd mise à jour: %s", update.CTFdURL)

				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success": true,
					"ctfdUrl": update.CTFdURL,
				})
				return
			}
		}

		if strings.HasPrefix(r.URL.Path, "/api") {
			p, _ := getProxy()
			p.ServeHTTP(w, r)
			return
		}

		fs.ServeHTTP(w, r)
	})

	addr := fmt.Sprintf("%s:%s", *host, *port)
	log.Printf("Proxy server started on http://%s", addr)
	_, target := getProxy()
	log.Printf("CTFd URL: %s", target)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
