# fqnovel-unidbg runtime image (mtongle/fqnovel-unidbg v0.0.4)
# Uses pre-built JAR from GitHub Releases (no Maven build needed, works on 1C1G VPS)
FROM openjdk:11-jre-slim

WORKDIR /app

# Install curl for healthcheck + wget for downloading JAR
RUN apt-get update && apt-get install -y --no-install-recommends curl wget && \
    rm -rf /var/lib/apt/lists/*

# Download pre-built JAR from GitHub Releases (v0.0.4, 352MB)
ARG JAR_URL=https://github.com/mtongle/fqnovel-unidbg/releases/download/v0.0.4/unidbg-boot-server-0.0.4.jar
RUN wget -q -O /app/app.jar "$JAR_URL" && \
    ls -la /app/app.jar

EXPOSE 8099

# Memory-limited JVM for 1C1G VPS
ENV JAVA_OPTS="-Xms64m -Xmx256m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC"

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -sf http://localhost:8099/actuator/health || curl -sf http://localhost:8099/api/fq-signature/test || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
