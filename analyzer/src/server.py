"""
Analyzer gRPC Server
Main entry point for the Analyzer service
"""

import asyncio
import signal
import sys
from concurrent import futures
from typing import Optional

import grpc

from . import firewall_pb2_grpc
from .config import config
from .service import FirewallServicer
from .logger import get_logger, log_startup, log_shutdown

# Get logger
logger = get_logger(__name__)


class GracefulShutdown:
    """Handle graceful shutdown of the server"""

    def __init__(self, server: grpc.Server):
        self.server = server
        self.shutdown_event = asyncio.Event()

    async def shutdown(self, signal_name: str) -> None:
        """
        Gracefully shutdown the server

        Args:
            signal_name: Name of the signal that triggered shutdown
        """
        log_shutdown(logger, f"Received {signal_name}")

        # Stop accepting new requests
        logger.info("Stopping server (grace period: %ds)", config.shutdown_timeout // 1000)

        # Attempt graceful shutdown with timeout
        await self.server.stop(config.shutdown_timeout // 1000)

        logger.info("Server stopped gracefully")
        self.shutdown_event.set()


async def serve() -> None:
    """
    Start the gRPC server with graceful shutdown support
    """
    # Validate configuration
    config.validate()

    # Log startup information
    log_startup(logger, config.get_summary())

    # Create gRPC server
    server = grpc.aio.server(
        futures.ThreadPoolExecutor(max_workers=config.grpc_max_workers),
        options=[
            ("grpc.max_send_message_length", config.grpc_max_message_size),
            ("grpc.max_receive_message_length", config.grpc_max_message_size),
            (
                "grpc.keepalive_time_ms",
                config.grpc_keepalive_time_ms,
            ),
            ("grpc.keepalive_timeout_ms", 5000),
            ("grpc.keepalive_permit_without_calls", True),
            ("grpc.http2.max_pings_without_data", 0),
        ],
    )

    # Add service to server
    firewall_pb2_grpc.add_FirewallServiceServicer_to_server(
        FirewallServicer(), server
    )

    # Bind to port
    listen_addr = f"{config.host}:{config.port}"
    server.add_insecure_port(listen_addr)

    # Start server
    logger.info("Starting gRPC server on %s", listen_addr)
    await server.start()
    logger.info("✅ Analyzer service started successfully")
    logger.info("📡 Listening on %s", listen_addr)

    # Setup graceful shutdown
    shutdown_handler = GracefulShutdown(server)

    # Setup signal handlers
    loop = asyncio.get_event_loop()

    def handle_signal(sig: signal.Signals) -> None:
        """Handle shutdown signals"""
        logger.info("Received signal: %s", sig.name)
        asyncio.create_task(shutdown_handler.shutdown(sig.name))

    # Register signal handlers
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda s=sig: handle_signal(s))

    # Wait for shutdown
    await shutdown_handler.shutdown_event.wait()
    logger.info("Server shutdown complete")


def main() -> None:
    """Main entry point"""
    try:
        # Run server
        asyncio.run(serve())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error("Server failed: %s", str(e), exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
