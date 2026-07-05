# Multi-stage build for fqnovel-unidbg (mtongle/fqnovel-unidbg)
# Stage 1: Build with Maven (memory-limited for small VPS)
FROM maven:3.8-openjdk-11-slim AS builder

WORKDIR /build

# Create JVM config to limit memory
RUN mkdir -p .mvn && echo '-Xms64m -Xmx256m -XX:MaxMetaspaceSize=96m' > .mvn/jvm.config

# Clone first (cached layer), then build
RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/* && \
    git clone --depth 1 https://github.com/mtongle/fqnovel-unidbg.git . && \
    mvn package -DskipTests -T 1 -Dmaven.javadoc.skip=true -B -q && \
    ls -la target/*.jar

# Stage 2: Runtime (minimal JRE)
FROM openjdk:11-jre-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/unidbg-boot-server-*.jar /app/app.jar

EXPOSE 8099

# Runtime: 128-256MB heap is enough for unidbg
ENV JAVA_OPTS="-Xms64m -Xmx192m -XX:MaxMetaspaceSize=96m -XX:+UseSerialGC"

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -sf http://localhost:8099/actuator/health || curl -sf http://localhost:8099/api/fq-signature/test || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
