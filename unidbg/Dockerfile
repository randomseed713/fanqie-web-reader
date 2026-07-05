# Multi-stage build for fqnovel-unidbg (mtongle/fqnovel-unidbg)
# Stage 1: Build with Maven
FROM maven:3.8-openjdk-11-slim AS builder

WORKDIR /build

# Clone and build
RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/* && \
    git clone --depth 1 https://github.com/mtongle/fqnovel-unidbg.git . && \
    mvn package -DskipTests -T 2 && \
    ls -la target/

# Stage 2: Runtime
FROM openjdk:11-jre-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Copy built JAR
COPY --from=builder /build/target/unidbg-boot-server-*.jar /app/app.jar

# Default config: port 8099, disable Redis (point to non-existent host)
RUN mkdir -p /root/.unidbg

EXPOSE 8099

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8099/actuator/health || curl -f http://localhost:8099/api/fq-signature/test || exit 1

ENTRYPOINT ["java", "-Xms256m", "-Xmx512m", "-jar", "/app/app.jar"]
