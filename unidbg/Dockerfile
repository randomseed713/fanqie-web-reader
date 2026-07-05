# fqnovel-unidbg runtime image (mtongle/fqnovel-unidbg v0.0.4)
# Alpine-based JRE for minimal disk/memory footprint (works on 1C1G VPS)
FROM eclipse-temurin:11-jre-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy pre-downloaded JAR (downloaded by deploy script)
COPY unidbg-boot-server.jar /app/app.jar

EXPOSE 8099

# Memory-limited JVM for 1C1G VPS
ENV JAVA_OPTS="-Xms64m -Xmx256m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC"

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -sf http://localhost:8099/actuator/health || curl -sf http://localhost:8099/api/fq-signature/test || exit 1

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/app.jar"]
