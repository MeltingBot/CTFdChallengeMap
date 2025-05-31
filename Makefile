.PHONY: build build-all run clean

# Build for current platform
build:
	go build -o ctfd-proxy proxy.go

# Build for multiple platforms
build-all:
	GOOS=linux GOARCH=amd64 go build -o ctfd-proxy-linux-amd64 proxy.go
	GOOS=windows GOARCH=amd64 go build -o ctfd-proxy-windows-amd64.exe proxy.go
	GOOS=darwin GOARCH=amd64 go build -o ctfd-proxy-darwin-amd64 proxy.go
	GOOS=darwin GOARCH=arm64 go build -o ctfd-proxy-darwin-arm64 proxy.go

# Run the proxy
run: build
	./ctfd-proxy

# Run with custom CTFd URL
run-custom: build
	CTFD_URL=https://medileak.oscarzulu.org ./ctfd-proxy

# Clean build artifacts
clean:
	rm -f ctfd-proxy ctfd-proxy-* *.exe